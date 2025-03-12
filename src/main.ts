import Logger from './logger.js';
import { startServer } from './server.js';

/**
 * Main function to initialize the application
 */
async function main(): Promise<void> {
  const span = Logger.span('main');

  try {
    // Set log level from environment variable if present
    const logLevel = process.env.LOG_LEVEL;
    if (
      logLevel &&
      Logger.LEVELS[logLevel.toUpperCase() as keyof typeof Logger.LEVELS] !==
        undefined
    ) {
      Logger.setLevel(
        Logger.LEVELS[logLevel.toUpperCase() as keyof typeof Logger.LEVELS],
      );
      Logger.info(`Set log level from environment`, {
        level: logLevel.toUpperCase(),
      });
    }

    // Start the server
    await startServer();

    span.end('success');
  } catch (error) {
    Logger.error('Fatal error in main', error);
    span.end('error');
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  Logger.error('Unhandled exception', error);
  process.exit(1);
});
