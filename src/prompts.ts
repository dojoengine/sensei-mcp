import fs from 'fs/promises';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import Logger from './logger.js';
import { loadFile } from './resources.js';
import {
  CallToolResult,
  GetPromptResult,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
export const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

// Resource reference regex pattern (e.g., {{resource:path/to/resource}})
export const RESOURCE_REF_PATTERN = /\{\{resource:(.*?)\}\}/g;

// Variable pattern for prompt files (e.g., {{variable_name}})
export const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

// Input variable pattern (special case for default input)
export const INPUT_VARIABLE_PATTERN = /\{\{input\}\}/g;

// Metadata pattern for prompt files
// Format: ---\nkey: value\n---
export const METADATA_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*\n/;

/**
 * Interface for prompt metadata
 */
export interface PromptMetadata {
  description?: string;
  registerAsTool?: boolean;
  toolName?: string;
  name?: string;
  role?: string;
  registerAsPrompt?: boolean;
}

/**
 * Parse metadata from prompt content
 */
export function parseMetadata(content: string): { metadata: PromptMetadata; content: string } {
  const metadata: PromptMetadata = {};
  const metadataMatch = content.match(METADATA_PATTERN);

  if (metadataMatch) {
    const metadataBlock = metadataMatch[1];
    
    // Only process metadata if there's actual content in the block
    if (metadataBlock.trim()) {
      const lines = metadataBlock.split('\n');

      for (const line of lines) {
        // Split only on the first colon to preserve colons in values
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          
          if (key && value) {
            switch (key) {
              case 'description':
                metadata.description = value;
                break;
              case 'name':
                metadata.name = value;
                break;
              case 'role':
                metadata.role = value;
                break;
              case 'register_as_prompt':
              case 'registerasprompt':
                metadata.registerAsPrompt = value.toLowerCase() === 'true';
                break;
              case 'register_as_tool':
              case 'registerastool':
                metadata.registerAsTool = value.toLowerCase() === 'true';
                break;
              case 'tool_name':
              case 'toolname':
                metadata.toolName = value;
                break;
            }
          }
        }
      }
    }

    // Remove metadata block from content
    return {
      metadata,
      content: content.substring(metadataMatch[0].length),
    };
  }

  return { metadata, content };
}

/**
 * Extract variables from prompt content
 */
export function extractVariables(content: string): string[] {
  const variables = new Set<string>();

  // Find all variable references (excluding resource references)
  const matches = content.matchAll(VARIABLE_PATTERN);

  for (const match of matches) {
    const variable = match[1];
    // Skip resource variables as they're handled separately
    if (!variable.startsWith('resource:')) {
      variables.add(variable);
    }
  }

  return Array.from(variables);
}

/**
 * Generate input schema based on variables in the prompt
 */
export function generateInputSchema(
  variables: string[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schemaObj: Record<string, z.ZodTypeAny> = {};

  // Add all other variables
  for (const variable of variables) {
    schemaObj[variable] = z.string().optional();
  }

  return z.object(schemaObj);
}

/**
 * Process prompt content to embed referenced resources
 */
export async function processPromptContent(
  content: string,
  resourceMap: Map<string, string>,
): Promise<string> {
  const span = Logger.span('processPromptContent', {
    contentLength: content.length,
  });
  let processedContent = content;

  // Find all resource references
  const resourceRefs = [...content.matchAll(RESOURCE_REF_PATTERN)];
  Logger.debug(`Found resource references`, { count: resourceRefs.length });

  // Process each reference
  for (const match of resourceRefs) {
    const [fullMatch, resourcePath] = match;
    const resourceUri = `file://${resourcePath}`;
    const resourceContent = resourceMap.get(resourceUri);

    if (!resourceContent) {
      Logger.warn(`Resource not found`, {
        uri: resourceUri,
        path: resourcePath,
      });
      processedContent = processedContent.replace(
        fullMatch,
        `[Resource not found: ${resourcePath}]`,
      );
    } else {
      // Directly embed the resource content
      Logger.debug(`Embedding resource`, {
        uri: resourceUri,
        contentLength: resourceContent.length,
      });
      processedContent = processedContent.replace(fullMatch, resourceContent);
    }
  }

  span.end('success');
  return processedContent;
}

/**
 * Register a prompt with the server
 */
export function registerPrompt(
  server: McpServer,
  promptName: string,
  processedContent: string,
  metadata: PromptMetadata,
): void {
  // Create a prompt handler that accepts the required arguments
  const promptHandler = (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _args: undefined,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extra: Record<string, unknown>,
  ): GetPromptResult => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: processedContent,
        },
      },
    ],
  });

  // Register as a regular prompt
  if (metadata.description) {
    // With description
    server.prompt(promptName, metadata.description, promptHandler);
  } else {
    // Without description
    server.prompt(promptName, promptHandler);
  }

  // If registerAsTool is true, also register as a tool
  if (metadata.registerAsTool) {
    const toolName = metadata.toolName || promptName;

    // Extract variables from the prompt content for the tool
    const variables = extractVariables(processedContent);
    Logger.debug(`Found variables in tool`, {
      name: toolName,
      variables,
    });

    // Create a schema object directly
    const schemaObj: Record<string, z.ZodTypeAny> = {};
    for (const variable of variables) {
      schemaObj[variable] = z.string().optional();
    }

    // Create tool handler that replaces variables and returns the result
    const toolHandler = async (
      inputs: Record<string, string>,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _extra: Record<string, unknown>,
    ): Promise<CallToolResult> => {
      const span = Logger.span('toolExecution', { tool: toolName });
      try {
        let finalContent = processedContent;

        // Replace each variable with its value
        for (const variable of variables) {
          const value = inputs[variable] || '';
          const pattern = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
          finalContent = finalContent.replace(pattern, value);
        }

        // If there's a generic input and no specific {{input}} variable,
        // append it to the end
        if (inputs.input && !variables.includes('input')) {
          finalContent = `${finalContent}\n\n${inputs.input}`;
        }

        span.end('success');
        return {
          content: [
            {
              type: 'text' as const,
              text: finalContent,
            },
          ],
        };
      } catch (error) {
        Logger.error(`Tool execution failed: ${toolName}`, error);
        span.end('error');
        throw error;
      }
    };

    // Register the tool
    if (metadata.description) {
      // With description
      server.tool(toolName, metadata.description, schemaObj, toolHandler);
    } else {
      // Without description
      server.tool(toolName, schemaObj, toolHandler);
    }

    Logger.info(`Registered prompt as tool`, {
      name: toolName,
      variables: variables.length > 0 ? variables : ['input'],
    });
  }
}

/**
 * Load all prompts from the prompts directory
 */
export async function loadPrompts(
  server: McpServer,
  resourceMap: Map<string, string>,
): Promise<void> {
  const span = Logger.span('loadPrompts');

  try {
    await fs.mkdir(PROMPTS_DIR, { recursive: true });
    Logger.debug(`Ensuring prompts directory exists`, { path: PROMPTS_DIR });

    const files = await fs.readdir(PROMPTS_DIR);
    Logger.info(`Found ${files.length} potential prompt files`, {
      directory: PROMPTS_DIR,
    });

    let loadedCount = 0;
    let toolCount = 0;

    for (const file of files) {
      const promptSpan = Logger.span('processPromptFile', { file });

      if (!file.endsWith('.txt')) {
        Logger.trace(`Skipping non-txt file`, { file });
        promptSpan.end('skipped_non_txt');
        continue;
      }

      const filePath = path.join(PROMPTS_DIR, file);
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        Logger.trace(`Skipping directory`, { path: filePath });
        promptSpan.end('skipped_directory');
        continue;
      }

      // Parse the prompt name from the filename
      const promptName = path.basename(file, '.txt');

      try {
        // Load the raw content
        const rawContent = await loadFile(filePath);

        // Parse metadata
        const { metadata, content } = parseMetadata(rawContent);

        Logger.debug(`Processing prompt content`, {
          name: promptName,
          rawLength: content.length,
          hasDescription: !!metadata.description,
          registerAsTool: !!metadata.registerAsTool,
        });

        // Process content to embed resources
        const processedContent = await processPromptContent(
          content,
          resourceMap,
        );

        // Register the prompt (and optionally as a tool)
        registerPrompt(server, promptName, processedContent, metadata);

        loadedCount++;
        if (metadata.registerAsTool) {
          toolCount++;
        }

        // Extract variables for logging
        const variables = extractVariables(processedContent);

        Logger.info(`Registered prompt`, {
          name: promptName,
          rawLength: content.length,
          processedLength: processedContent.length,
          description: metadata.description
            ? metadata.description.substring(0, 50) + '...'
            : 'None',
          isTool: metadata.registerAsTool,
          variables: variables.length > 0 ? variables : ['input'],
        });

        promptSpan.end('success');
      } catch (error) {
        Logger.error(`Failed to process prompt file`, error, {
          path: filePath,
        });
        promptSpan.end('error');
      }
    }

    Logger.info(`Successfully loaded prompts`, {
      total: loadedCount,
      tools: toolCount,
    });

    span.end('success');
  } catch (error) {
    Logger.error('Failed to load prompts directory', error);
    span.end('error');
  }
}
