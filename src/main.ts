import fs from 'fs/promises';
import path from 'path';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Logger from './logger.js';

// Configuration
const RESOURCES_DIR = path.join(process.cwd(), 'resources');
const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

// Resource reference regex pattern (e.g., {{resource:path/to/resource}})
const RESOURCE_REF_PATTERN = /\{\{resource:(.*?)\}\}/g;

/**
 * Load a file's content from disk
 */
async function loadFile(filePath: string): Promise<string> {
  const span = Logger.span('loadFile', { path: filePath });
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    span.end('success');
    return content;
  } catch (error) {
    Logger.error(`Failed to load file: ${filePath}`, error);
    span.end('error');
    throw new Error(`Failed to load file: ${filePath}`);
  }
}

/**
 * Load all resources from the resources directory
 */
async function loadResources(server: McpServer): Promise<Map<string, string>> {
  const span = Logger.span('loadResources');
  const resourceMap = new Map<string, string>();
  
  try {
    await fs.mkdir(RESOURCES_DIR, { recursive: true });
    Logger.debug(`Ensuring resources directory exists`, { path: RESOURCES_DIR });
    
    const files = await fs.readdir(RESOURCES_DIR, { recursive: true });
    Logger.info(`Found ${files.length} potential resource files`, { directory: RESOURCES_DIR });
    
    let loadedCount = 0;
    
    for (const file of files) {
      const fileSpan = Logger.span('processResourceFile', { file });
      
      // Skip directories and non-text files
      const filePath = path.join(RESOURCES_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        Logger.trace(`Skipping directory`, { path: filePath });
        fileSpan.end('skipped_directory');
        continue;
      }
      
      // Convert file path to resource URI
      // e.g., resources/docs/intro.txt -> docs/intro
      const relPath = path.relative(RESOURCES_DIR, filePath);
      const resourcePath = relPath.replace(/\.[^/.]+$/, ''); // Remove extension
      const resourceUri = `file://${resourcePath}`;
      
      // Load the content
      try {
        const content = await loadFile(filePath);
        resourceMap.set(resourceUri, content);
        loadedCount++;
        
        // Register the resource with the server
        server.resource(
          `resource-${resourcePath.replace(/\//g, '-')}`,
          resourceUri,
          async (uri) => ({
            contents: [{
              uri: uri.href,
              text: content
            }]
          })
        );
        
        Logger.info(`Registered resource`, { uri: resourceUri, size: content.length });
        fileSpan.end('success');
      } catch (error) {
        Logger.error(`Failed to process resource file`, error, { path: filePath });
        fileSpan.end('error');
      }
    }
    
    Logger.info(`Successfully loaded resources`, { total: loadedCount });
    
    // Also register a dynamic resource template for accessing any resource by path
    server.resource(
      "file-resource",
      new ResourceTemplate("file://{path}", { list: undefined }),
      async (uri, params) => {
        const span = Logger.span('dynamicResourceLoad', { path: params.path });
        try {
          const resourcePath = params.path;
          const filePath = path.join(RESOURCES_DIR, resourcePath + '.txt');
          const content = await loadFile(filePath);
          span.end('success');
          return {
            contents: [{
              uri: uri.href,
              text: content
            }]
          };
        } catch (err) {
          Logger.error(`Failed to load dynamic resource`, err, { path: params.path });
          span.end('error');
          return {
            contents: [{
              uri: uri.href,
              text: `Error: Resource not found at path ${params.path}`
            }]
          };
        }
      }
    );
    
    span.end('success');
    return resourceMap;
  } catch (error) {
    Logger.error("Failed to load resources directory", error);
    span.end('error');
    return resourceMap;
  }
}

/**
 * Process prompt content to embed referenced resources
 */
async function processPromptContent(content: string, resourceMap: Map<string, string>): Promise<string> {
  const span = Logger.span('processPromptContent', { contentLength: content.length });
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
      Logger.warn(`Resource not found`, { uri: resourceUri, path: resourcePath });
      processedContent = processedContent.replace(fullMatch, `[Resource not found: ${resourcePath}]`);
    } else {
      // Directly embed the resource content
      Logger.debug(`Embedding resource`, { 
        uri: resourceUri, 
        contentLength: resourceContent.length 
      });
      processedContent = processedContent.replace(fullMatch, resourceContent);
    }
  }
  
  span.end('success');
  return processedContent;
}

/**
 * Load all prompts from the prompts directory
 */
async function loadPrompts(server: McpServer, resourceMap: Map<string, string>): Promise<void> {
  const span = Logger.span('loadPrompts');
  
  try {
    await fs.mkdir(PROMPTS_DIR, { recursive: true });
    Logger.debug(`Ensuring prompts directory exists`, { path: PROMPTS_DIR });
    
    const files = await fs.readdir(PROMPTS_DIR);
    Logger.info(`Found ${files.length} potential prompt files`, { directory: PROMPTS_DIR });
    
    let loadedCount = 0;
    
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
        // Load and process the prompt content
        const rawContent = await loadFile(filePath);
        Logger.debug(`Processing prompt content`, { 
          name: promptName, 
          rawLength: rawContent.length 
        });
        
        const processedContent = await processPromptContent(rawContent, resourceMap);
        
        // Register the prompt with the server
        server.prompt(
          promptName,
          { input: z.string().optional() },
          ({ input = "" }) => ({
            messages: [{
              role: "user",
              content: {
                type: "text",
                text: `${processedContent}\n\n${input}`
              }
            }]
          })
        );
        
        loadedCount++;
        Logger.info(`Registered prompt`, { 
          name: promptName, 
          rawLength: rawContent.length,
          processedLength: processedContent.length
        });
        promptSpan.end('success');
      } catch (error) {
        Logger.error(`Failed to process prompt file`, error, { path: filePath });
        promptSpan.end('error');
      }
    }
    
    Logger.info(`Successfully loaded prompts`, { total: loadedCount });
    span.end('success');
  } catch (error) {
    Logger.error("Failed to load prompts directory", error);
    span.end('error');
  }
}

/**
 * Main function to start the MCP server
 */
async function main(): Promise<void> {
  const span = Logger.span('main');
  
  try {
    // Set log level from environment variable if present
    const logLevel = process.env.LOG_LEVEL;
    if (logLevel && Logger.LEVELS[logLevel.toUpperCase() as keyof typeof Logger.LEVELS] !== undefined) {
      Logger.setLevel(Logger.LEVELS[logLevel.toUpperCase() as keyof typeof Logger.LEVELS]);
      Logger.info(`Set log level from environment`, { level: logLevel.toUpperCase() });
    }
    
    // Create the MCP server
    const server = new McpServer({
      name: "Sensei",
      version: "0.0.1",
    });
    
    Logger.info("Starting Sensei server");
    
    // Load resources
    const resourceMap = await loadResources(server);
    Logger.info(`Resources loaded`, { count: resourceMap.size });
    
    // Load prompts
    await loadPrompts(server, resourceMap);
    
    // Start receiving messages on stdin and sending messages on stdout
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    Logger.info("Sensei server connected and ready");
    span.end('success');
  } catch (error) {
    Logger.error("Fatal error in main", error);
    span.end('error');
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  Logger.error("Unhandled exception", error);
  process.exit(1);
});