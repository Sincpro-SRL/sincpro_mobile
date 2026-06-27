import { getLokiClient } from "./telemetry/logging/loki_registry";
import { activeTraceLabel } from "./telemetry/tracing/active_span";

type LoggerArgs = unknown[];

interface ILogger {
  debug(...args: LoggerArgs): void;

  info(...args: LoggerArgs): void;

  warn(...args: LoggerArgs): void;

  error(...args: LoggerArgs): void;
}

// ANSI color codes for terminal output
const Colors = {
  Reset: "\x1b[0m",
  Gray: "\x1b[90m",
  Red: "\x1b[31m",
  Yellow: "\x1b[33m",
  Blue: "\x1b[34m",
  Cyan: "\x1b[36m",
  Green: "\x1b[32m",
  Magenta: "\x1b[35m",
  BrightBlue: "\x1b[94m",
  BrightGreen: "\x1b[92m",
  BrightCyan: "\x1b[96m",
  BrightMagenta: "\x1b[95m",
  BrightYellow: "\x1b[93m",
  White: "\x1b[37m",
};

const ELogLevel = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type ELogLevel = (typeof ELogLevel)[keyof typeof ELogLevel];

const EApplicationLogger = {
  GLOBAL: "GLOBAL",
  ODOO_CLIENT: "ODOO_CLIENT",
  ADAPTER: "ADAPTER",
  REPOSITORIES: "REPOSITORIES",
  USE_CASES: "USE_CASES",
  QUEUE_PROCESSOR: "EVENT_BUS",
  CRON_JOBS: "CRON_JOBS",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type EApplicationLogger = (typeof EApplicationLogger)[keyof typeof EApplicationLogger];

/**
 * Color mapping for each logger context
 */
const LoggerColors: Record<EApplicationLogger, string> = {
  [EApplicationLogger.GLOBAL]: Colors.White,
  [EApplicationLogger.ODOO_CLIENT]: Colors.Gray,
  [EApplicationLogger.ADAPTER]: Colors.Gray,
  [EApplicationLogger.REPOSITORIES]: Colors.Gray,
  [EApplicationLogger.USE_CASES]: Colors.BrightGreen,
  [EApplicationLogger.QUEUE_PROCESSOR]: Colors.BrightYellow,
  [EApplicationLogger.CRON_JOBS]: Colors.Gray,
};

/**
 * Production flag - manually toggle to disable all logs
 * Set to true to disable logging, false to enable
 */
export const IS_PRODUCTION = false;

/**
 * Global log level for the application.
 */
export const LOG_LEVEL = ELogLevel.INFO;

/**
 * Configuration for enabling or disabling logs for specific application contexts.
 */
export const ENABLED_LOGS: Record<EApplicationLogger, boolean> = {
  [EApplicationLogger.GLOBAL]: true,
  [EApplicationLogger.ODOO_CLIENT]: false,
  [EApplicationLogger.ADAPTER]: false,
  [EApplicationLogger.REPOSITORIES]: false,
  [EApplicationLogger.USE_CASES]: true,
  [EApplicationLogger.QUEUE_PROCESSOR]: true,
  [EApplicationLogger.CRON_JOBS]: true,
};

class BaseLogger implements ILogger {
  protected readonly context: EApplicationLogger;
  protected readonly contextPrefix: string;

  constructor(context: EApplicationLogger) {
    this.context = context;
    this.contextPrefix = context === EApplicationLogger.GLOBAL ? "" : `[${context}]`;
  }

  private getLogColor(level: ELogLevel): string {
    switch (level) {
      case ELogLevel.DEBUG:
        return Colors.Gray;
      case ELogLevel.INFO:
        return Colors.Cyan;
      case ELogLevel.WARN:
        return Colors.Yellow;
      case ELogLevel.ERROR:
        return Colors.Red;
      default:
        return Colors.White;
    }
  }

  private getContextColor(): string {
    return LoggerColors[this.context];
  }

  private log(level: ELogLevel, method: typeof console.log, args: LoggerArgs): void {
    if (this.shouldLog(level)) {
      this.output(method, level, args);
    }
    // Remote push is independent of console filters — IS_PRODUCTION and ENABLED_LOGS
    // control console verbosity, not what reaches Loki in production.
    this.pushRemote(level, args);
  }

  protected shouldLog(level: ELogLevel): boolean {
    if (IS_PRODUCTION) return false;
    if (level === ELogLevel.ERROR || level === ELogLevel.WARN) return true;
    if (level === ELogLevel.DEBUG && (LOG_LEVEL as ELogLevel) !== ELogLevel.DEBUG)
      return false;
    if (!ENABLED_LOGS[this.context]) return false;
    return true;
  }

  /**
   * Remote logging filter — intentionally decoupled from console config.
   * ERROR and WARN always reach Loki (production incidents must be observable).
   * INFO reaches Loki only for enabled contexts (avoids noise from disabled ones).
   * DEBUG never goes remote (too verbose for a push store).
   * IS_PRODUCTION does NOT gate this — it controls the console, not telemetry.
   */
  private shouldLogRemote(level: ELogLevel): boolean {
    if (level === ELogLevel.ERROR || level === ELogLevel.WARN) return true;
    if (level === ELogLevel.INFO) return ENABLED_LOGS[this.context];
    return false;
  }

  private pushRemote(level: ELogLevel, args: LoggerArgs): void {
    if (!this.shouldLogRemote(level)) return;
    const client = getLokiClient();
    if (!client) return;
    // Include context in the message so logs are filterable in Grafana
    // without needing a high-cardinality label: `{app="..."} |= "[USE_CASES]"`
    const prefix = this.context !== EApplicationLogger.GLOBAL ? `[${this.context}] ` : "";
    const lvl = level.toLowerCase();
    const traceLabel = activeTraceLabel();
    queueMicrotask(() => client.push(lvl, prefix + this.serialize(args) + traceLabel));
  }

  protected output(method: typeof console.log, level: ELogLevel, args: LoggerArgs): void {
    const timestamp = new Date().toISOString();
    const contextColor = this.getContextColor();

    if (this.contextPrefix) {
      method(
        `${Colors.Gray}${timestamp}${Colors.Reset}`,
        `${contextColor}${this.contextPrefix}`,
        ...args,
        Colors.Reset,
      );
    } else {
      method(`${Colors.Gray}${timestamp}${Colors.Reset}`, ...args);
    }
  }

  private serialize(args: LoggerArgs): string {
    const MAX = 2048;
    const msg = args
      .map((a) => {
        try {
          return typeof a === "string" ? a : JSON.stringify(a);
        } catch {
          return "[unserializable]";
        }
      })
      .join(" ");
    return msg.length > MAX ? `${msg.slice(0, MAX)}…` : msg;
  }

  debug(...args: LoggerArgs): void {
    this.log(ELogLevel.DEBUG, console.debug, args);
  }

  info(...args: LoggerArgs): void {
    this.log(ELogLevel.INFO, console.log, args);
  }

  warn(...args: LoggerArgs): void {
    this.log(ELogLevel.WARN, console.warn, args);
  }

  error(...args: LoggerArgs): void {
    this.log(ELogLevel.ERROR, console.error, args);
  }
}

export function createLogger(context: EApplicationLogger): ILogger {
  return new BaseLogger(context);
}

const logger = createLogger(EApplicationLogger.GLOBAL);
export const loggerOdooClient = createLogger(EApplicationLogger.ODOO_CLIENT);
export const loggerAdapter = createLogger(EApplicationLogger.ADAPTER);
export const loggerRepositories = createLogger(EApplicationLogger.REPOSITORIES);
export const loggerUseCases = createLogger(EApplicationLogger.USE_CASES);
export const loggerQueueProcessor = createLogger(EApplicationLogger.QUEUE_PROCESSOR);
export const loggerCronJobs = createLogger(EApplicationLogger.CRON_JOBS);

export { EApplicationLogger };

export default logger;
