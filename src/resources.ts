import fs from 'fs/promises';
import path from 'path';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import Logger from './logger.js';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
export const RESOURCES_DIR = path.join(process.cwd(), 'resources');

// Try to use the package directory for resources if it exists
export async function getResourcesDir(): Promise<string> {
  const packageResourcesDir = path.join(__dirname, '../../resources');
  try {
    await fs.access(packageResourcesDir);
    return packageResourcesDir;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _error
  ) {
    return RESOURCES_DIR;
  }
}

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
    Logger.error(`Failed to load file`, error, { path: filePath });
    span.end('error');
    throw error;
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
    // Get the resources directory
    const resourcesDir = await getResourcesDir();
    await fs.mkdir(resourcesDir, { recursive: true });
    Logger.debug(`Ensuring resources directory exists`, { path: resourcesDir });

    const files = await fs.readdir(resourcesDir);
    Logger.info(`Found ${files.length} potential resource files`, {
      directory: resourcesDir,
    });

    let loadedCount = 0;

    for (const file of files) {
      const resourceSpan = Logger.span('processResourceFile', { file });

      if (!file.endsWith('.txt')) {
        Logger.trace(`Skipping non-txt file`, { file });
        resourceSpan.end('skipped_non_txt');
        continue;
      }

      const filePath = path.join(resourcesDir, file);
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        Logger.trace(`Skipping directory`, { path: filePath });
        resourceSpan.end('skipped_directory');
        continue;
      }

      // Convert file path to resource URI
      // e.g., resources/docs/intro.txt -> docs/intro
      const relPath = path.relative(resourcesDir, filePath);
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
        resourceSpan.end('success');
      } catch (error) {
        Logger.error(`Failed to process resource file`, error, {
          path: filePath,
        });
        resourceSpan.end('error');
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
          const filePath = path.join(resourcesDir, resourcePath + '.txt');
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
