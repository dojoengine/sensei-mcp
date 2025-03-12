// Logger inspired by Rust's tracing crate with color support
export const Logger = {
  LEVELS: {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
  },

  COLORS: {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    DIM: '\x1b[2m',
    UNDERSCORE: '\x1b[4m',
    BLINK: '\x1b[5m',
    REVERSE: '\x1b[7m',
    HIDDEN: '\x1b[8m',

    FG_BLACK: '\x1b[30m',
    FG_RED: '\x1b[31m',
    FG_GREEN: '\x1b[32m',
    FG_YELLOW: '\x1b[33m',
    FG_BLUE: '\x1b[34m',
    FG_MAGENTA: '\x1b[35m',
    FG_CYAN: '\x1b[36m',
    FG_WHITE: '\x1b[37m',
    FG_GRAY: '\x1b[90m',

    BG_BLACK: '\x1b[40m',
    BG_RED: '\x1b[41m',
    BG_GREEN: '\x1b[42m',
    BG_YELLOW: '\x1b[43m',
    BG_BLUE: '\x1b[44m',
    BG_MAGENTA: '\x1b[45m',
    BG_CYAN: '\x1b[46m',
    BG_WHITE: '\x1b[47m',
  },

  LEVEL_COLORS: {
    TRACE: { text: 'FG_GRAY', label: 'FG_GRAY' },
    DEBUG: { text: 'FG_CYAN', label: 'FG_CYAN' },
    INFO: { text: 'FG_GREEN', label: 'FG_GREEN' },
    WARN: { text: 'FG_YELLOW', label: 'FG_YELLOW' },
    ERROR: { text: 'FG_RED', label: 'FG_RED' },
  },

  currentLevel: 2, // Default to INFO level

  // Track spans for operations
  spans: new Map<
    string,
    { startTime: number; metadata: Record<string, unknown> }
  >(),

  setLevel(level: number): void {
    this.currentLevel = level;
  },

  colorize(text: string, colorName: keyof typeof Logger.COLORS): string {
    return `${this.COLORS[colorName]}${text}${this.COLORS.RESET}`;
  },

  formatMessage(
    level: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): string {
    const timestamp = new Date().toISOString();
    const levelColor =
      this.LEVEL_COLORS[level as keyof typeof Logger.LEVEL_COLORS];

    // Colorize the timestamp with dim color
    const coloredTimestamp = this.colorize(`[${timestamp}]`, 'DIM');

    // Colorize the level
    const coloredLevel = this.colorize(
      level.padEnd(5),
      levelColor.label as keyof typeof Logger.COLORS,
    );

    // Colorize the message
    const coloredMessage = this.colorize(
      message,
      levelColor.text as keyof typeof Logger.COLORS,
    );

    let formattedMessage = `${coloredTimestamp} ${coloredLevel}: ${coloredMessage}`;

    if (metadata && Object.keys(metadata).length > 0) {
      // Format metadata with dim color
      const metadataStr = this.colorize(
        JSON.stringify(metadata, null, level === 'ERROR' ? 2 : 0),
        'DIM',
      );
      formattedMessage += ` ${metadataStr}`;
    }

    return formattedMessage;
  },

  trace(message: string, metadata?: Record<string, unknown>): void {
    if (this.currentLevel <= this.LEVELS.TRACE) {
      console.log(this.formatMessage('TRACE', message, metadata));
    }
  },

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (this.currentLevel <= this.LEVELS.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, metadata));
    }
  },

  info(message: string, metadata?: Record<string, unknown>): void {
    if (this.currentLevel <= this.LEVELS.INFO) {
      console.log(this.formatMessage('INFO', message, metadata));
    }
  },

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (this.currentLevel <= this.LEVELS.WARN) {
      console.warn(this.formatMessage('WARN', message, metadata));
    }
  },

  error(
    message: string,
    error?: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    if (this.currentLevel <= this.LEVELS.ERROR) {
      const combinedMetadata = { ...metadata };
      if (error instanceof Error) {
        combinedMetadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else if (error) {
        combinedMetadata.error = error;
      }
      console.error(this.formatMessage('ERROR', message, combinedMetadata));
    }
  },

  // Create a span to track an operation
  span(
    name: string,
    metadata?: Record<string, unknown>,
  ): { end: (outcome?: string) => void } {
    const spanId = `${name}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const startTime = performance.now();

    this.spans.set(spanId, { startTime, metadata: metadata || {} });
    this.debug(`Started span: ${name}`, { span: spanId, ...metadata });

    return {
      end: (outcome?: string): void => {
        const span = this.spans.get(spanId);
        if (span) {
          const duration = performance.now() - span.startTime;
          this.debug(`Ended span: ${name}`, {
            span: spanId,
            duration_ms: duration.toFixed(2),
            outcome,
            ...span.metadata,
          });
          this.spans.delete(spanId);
        }
      },
    };
  },
};

// Initialize from environment if available
const initLogger = (): void => {
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
};

initLogger();

export default Logger;
