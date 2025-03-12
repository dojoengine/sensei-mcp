import fs from 'fs/promises';
import path from 'path';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import Logger from './logger.js';

// Configuration
export const RESOURCES_DIR = path.join(process.cwd(), 'resources');

/**
 * Load a file's content from disk
 */
export async function loadFile(filePath: string): Promise<string> {
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
export async function loadResources(
  server: McpServer,
): Promise<Map<string, string>> {
  const span = Logger.span('loadResources');
  const resourceMap = new Map<string, string>();

  try {
    await fs.mkdir(RESOURCES_DIR, { recursive: true });
    Logger.debug(`Ensuring resources directory exists`, {
      path: RESOURCES_DIR,
    });

    const files = await fs.readdir(RESOURCES_DIR, { recursive: true });
    Logger.info(`Found ${files.length} potential resource files`, {
      directory: RESOURCES_DIR,
    });

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
            contents: [
              {
                uri: uri.href,
                text: content,
              },
            ],
          }),
        );

        Logger.info(`Registered resource`, {
          uri: resourceUri,
          size: content.length,
        });
        fileSpan.end('success');
      } catch (error) {
        Logger.error(`Failed to process resource file`, error, {
          path: filePath,
        });
        fileSpan.end('error');
      }
    }

    Logger.info(`Successfully loaded resources`, { total: loadedCount });

    // Also register a dynamic resource template for accessing any resource by path
    server.resource(
      'file-resource',
      new ResourceTemplate('file://{path}', { list: undefined }),
      async (uri, params) => {
        const span = Logger.span('dynamicResourceLoad', { path: params.path });
        try {
          const resourcePath = params.path;
          const filePath = path.join(RESOURCES_DIR, resourcePath + '.txt');
          const content = await loadFile(filePath);
          span.end('success');
          return {
            contents: [
              {
                uri: uri.href,
                text: content,
              },
            ],
          };
        } catch (err) {
          Logger.error(`Failed to load dynamic resource`, err, {
            path: params.path,
          });
          span.end('error');
          return {
            contents: [
              {
                uri: uri.href,
                text: `Error: Resource not found at path ${params.path}`,
              },
            ],
          };
        }
      },
    );

    span.end('success');
    return resourceMap;
  } catch (error) {
    Logger.error('Failed to load resources directory', error);
    span.end('error');
    return resourceMap;
  }
}
