import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Logger from './logger.js';
import { loadResources } from './resources.js';
import { loadPrompts } from './prompts.js';
import fs from 'fs/promises';
import path from 'path';
import { PROMPTS_DIR, parseMetadata } from './prompts.js';

// Server configuration
const SERVER_CONFIG = {
  name: 'Sensei',
  version: '0.0.1',
};

/**
 * Initialize and start the MCP server
 */
export async function startServer(): Promise<void> {
  const span = Logger.span('startServer');

  try {
    // Load the sensei prompt content to use as server instructions
    const senseiPromptPath = path.join(PROMPTS_DIR, 'sensei.txt');
    let senseiInstructions = '';

    try {
      const rawContent = await fs.readFile(senseiPromptPath, 'utf-8');
      // Parse the content to remove metadata
      const { content } = parseMetadata(rawContent);

      // Use the content without metadata as server instructions
      senseiInstructions = content;

      Logger.info('Loaded sensei prompt for server instructions', {
        path: senseiPromptPath,
        contentLength: senseiInstructions.length,
      });
    } catch (error) {
      Logger.warn('Failed to load sensei prompt for server instructions', {
        path: senseiPromptPath,
        error: (error as Error).message,
      });
    }

    // Create the MCP server with instructions
    const server = new McpServer(SERVER_CONFIG, {
      instructions: senseiInstructions,
    });

    Logger.info('Starting Sensei server', {
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
      hasInstructions: senseiInstructions.length > 0,
    });

    // Load resources
    const resourceMap = await loadResources(server);
    Logger.info(`Resources loaded`, { count: resourceMap.size });

    // Load prompts
    await loadPrompts(server, resourceMap);

    // Start receiving messages on stdin and sending messages on stdout
    const transport = new StdioServerTransport();
    await server.connect(transport);

    Logger.info('Sensei server connected and ready');
    span.end('success');
  } catch (error) {
    Logger.error('Failed to start server', error);
    span.end('error');
    throw error;
  }
}
