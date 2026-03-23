/**
 * Structured Logger with environment-aware formatting
 * - Production: JSON output for log aggregation
 * - Development: Pretty-printed for readability
 */

const isProduction = process.env.NODE_ENV === 'production';

interface LogData {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatLog(data: LogData): string {
  if (isProduction) {
    return JSON.stringify(data);
  }

  // Pretty format for development
  const { level, message, timestamp, ...rest } = data;
  const levelColors: Record<string, string> = {
    info: '\x1b[36m', // Cyan
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    debug: '\x1b[35m', // Magenta
  };
  const reset = '\x1b[0m';
  const color = levelColors[level] || reset;

  let output = `${color}[${level.toUpperCase()}]${reset} ${timestamp} - ${message}`;

  if (Object.keys(rest).length > 0) {
    // Remove error stack from inline display, show it separately
    const { error, ...otherData } = rest as {
      error?: { stack?: string };
      [key: string]: unknown;
    };

    if (Object.keys(otherData).length > 0) {
      output += `\n  ${JSON.stringify(otherData, null, 2).replace(
        /\n/g,
        '\n  '
      )}`;
    }

    if (error?.stack) {
      output += `\n  Stack: ${error.stack}`;
    }
  }

  return output;
}

export const Logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    const logData: LogData = {
      level: 'info',
      message,
      ...data,
      timestamp: new Date().toISOString(),
    };
    console.log(formatLog(logData));
  },

  warn: (message: string, data?: Record<string, unknown>) => {
    const logData: LogData = {
      level: 'warn',
      message,
      ...data,
      timestamp: new Date().toISOString(),
    };
    console.warn(formatLog(logData));
  },

  error: (message: string, error?: unknown, data?: Record<string, unknown>) => {
    const errorData =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error;

    const logData: LogData = {
      level: 'error',
      message,
      error: errorData,
      ...data,
      timestamp: new Date().toISOString(),
    };
    console.error(formatLog(logData));
  },

  debug: (message: string, data?: Record<string, unknown>) => {
    if (isProduction) return;

    const logData: LogData = {
      level: 'debug',
      message,
      ...data,
      timestamp: new Date().toISOString(),
    };
    console.debug(formatLog(logData));
  },
};
