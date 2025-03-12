/**
 * Some predefined delay values (in milliseconds).
 */
export enum Delays {
  Short = 500,
  Medium = 2000,
  Long = 5000,
}

/**
 * Returns a Promise<string> that resolves after a given time.
 *
 * @param {string} name - A name.
 * @param {number=} [delay=Delays.Medium] - A number of milliseconds to delay resolution of the Promise.
 * @returns {Promise<string>}
 */
function delayedHello(
  name: string,
  delay: number = Delays.Medium,
): Promise<string> {
  return new Promise((resolve: (value?: string) => void) =>
    setTimeout(() => resolve(`Hello, ${name}`), delay),
  );
}

// Please see the comment in the .eslintrc.json file about the suppressed rule!
// Below is an example of how to use ESLint errors suppression. You can read more
// at https://eslint.org/docs/latest/user-guide/configuring/rules#disabling-rules

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
export async function greeter(name: any) {
  // The name parameter should be of type string. Any is used only to trigger the rule.
  return await delayedHello(name, Delays.Long);
}
import fs from 'fs/promises';
import path from 'path';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Configuration
const RESOURCES_DIR = path.join(process.cwd(), 'resources');
const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

// Resource reference regex pattern (e.g., {{resource:path/to/resource}})
const RESOURCE_REF_PATTERN = /\{\{resource:(.*?)\}\}/g;

/**
 * Load a file's content from disk
 */
async function loadFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error);
    throw new Error(`Failed to load file: ${filePath}`);
  }
}

/**
 * Load all resources from the resources directory
 */
async function loadResources(server: McpServer): Promise<Map<string, string>> {
  const resourceMap = new Map<string, string>();
  
  try {
    await fs.mkdir(RESOURCES_DIR, { recursive: true });
    const files = await fs.readdir(RESOURCES_DIR, { recursive: true });
    
    for (const file of files) {
      // Skip directories and non-text files
      const filePath = path.join(RESOURCES_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) continue;
      
      // Convert file path to resource URI
      // e.g., resources/docs/intro.txt -> docs/intro
      const relPath = path.relative(RESOURCES_DIR, filePath);
      const resourcePath = relPath.replace(/\.[^/.]+$/, ''); // Remove extension
      const resourceUri = `file://${resourcePath}`;
      
      // Load the content
      const content = await loadFile(filePath);
      resourceMap.set(resourceUri, content);
      
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
      
      console.log(`Registered resource: ${resourceUri}`);
    }
    
    // Also register a dynamic resource template for accessing any resource by path
    server.resource(
      "file-resource",
      new ResourceTemplate("file://{path}", { list: undefined }),
      async (uri, params) => {
        try {
          const resourcePath = params.path;
          const filePath = path.join(RESOURCES_DIR, resourcePath + '.txt');
          const content = await loadFile(filePath);
          return {
            contents: [{
              uri: uri.href,
              text: content
            }]
          };
        } catch (err) {
          console.error(`Failed to load resource at path ${params.path}:`, err);
          return {
            contents: [{
              uri: uri.href,
              text: `Error: Resource not found at path ${params.path}`
            }]
          };
        }
      }
    );
    
    return resourceMap;
  } catch (error) {
    console.error("Error loading resources:", error);
    return resourceMap;
  }
}

/**
 * Process prompt content to embed referenced resources
 */
async function processPromptContent(content: string, resourceMap: Map<string, string>): Promise<string> {
  let processedContent = content;
  
  // Find all resource references
  const resourceRefs = [...content.matchAll(RESOURCE_REF_PATTERN)];
  
  // Process each reference
  for (const match of resourceRefs) {
    const [fullMatch, resourcePath] = match;
    const resourceUri = `file://${resourcePath}`;
    const resourceContent = resourceMap.get(resourceUri);
    
    if (!resourceContent) {
      console.warn(`Warning: Resource not found: ${resourceUri}`);
      processedContent = processedContent.replace(fullMatch, `[Resource not found: ${resourcePath}]`);
    } else {
      // Directly embed the resource content
      processedContent = processedContent.replace(fullMatch, resourceContent);
    }
  }
  
  return processedContent;
}

/**
 * Load all prompts from the prompts directory
 */
async function loadPrompts(server: McpServer, resourceMap: Map<string, string>) {
  try {
    await fs.mkdir(PROMPTS_DIR, { recursive: true });
    const files = await fs.readdir(PROMPTS_DIR);
    
    for (const file of files) {
      if (!file.endsWith('.txt')) continue;
      
      const filePath = path.join(PROMPTS_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) continue;
      
      // Parse the prompt name from the filename
      const promptName = path.basename(file, '.txt');
      
      // Load and process the prompt content
      const rawContent = await loadFile(filePath);
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
      
      console.log(`Registered prompt: ${promptName}`);
    }
  } catch (error) {
    console.error("Error loading prompts:", error);
  }
}

/**
 * Main function to start the MCP server
 */
async function main() {
  // Create the MCP server
  const server = new McpServer({
    name: "File Resource Server",
    version: "1.0.0"
  });
  
  console.log("Starting MCP File Resource Server...");
  
  // Load resources
  const resourceMap = await loadResources(server);
  console.log(`Loaded ${resourceMap.size} resources`);
  
  // Load prompts
  await loadPrompts(server, resourceMap);
  
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.log("MCP Server connected and ready");
}

// Start the server
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});