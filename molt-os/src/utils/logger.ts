import { ISettingsParam, Logger, ILogObj } from "tslog";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type LogLevel = "silly" | "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogConfig {
  level: LogLevel;
  logPath: string;
  maxFiles: number;
  maxFileSize: number;
  enableConsole: boolean;
  enableFile: boolean;
  jsonFormat: boolean;
}

const defaultConfig: LogConfig = {
  level: "info",
  logPath: path.join(__dirname, "..", "..", "logs"),
  maxFiles: 5,
  maxFileSize: 10 * 1024 * 1024,
  enableConsole: true,
  enableFile: true,
  jsonFormat: false,
};

let loggerInstance: Logger<ILogObj> | null = null;
let logConfig: LogConfig = { ...defaultConfig };
let logRotationInterval: ReturnType<typeof setInterval> | null = null;

export interface LoggerOptions extends ISettingsParam<ILogObj> {
  name?: string;
}

export function getLogConfig(): LogConfig {
  return { ...logConfig };
}

export function configureLogging(config: Partial<LogConfig>): void {
  logConfig = { ...logConfig, ...config };
}

function ensureLogDirectory(): void {
  if (!fs.existsSync(logConfig.logPath)) {
    fs.mkdirSync(logConfig.logPath, { recursive: true });
  }
}

function setupLogRotation(): void {
  if (logRotationInterval) {
    clearInterval(logRotationInterval);
  }

  logRotationInterval = setInterval(() => {
    rotateLogs();
  }, 3600000);
}

function rotateLogs(): void {
  try {
    const logDir = logConfig.logPath;
    const mainLogPath = path.join(logDir, "molt-os.log");

    if (!fs.existsSync(mainLogPath)) {
      return;
    }

    const stats = fs.statSync(mainLogPath);
    if (stats.size < logConfig.maxFileSize) {
      return;
    }

    for (let i = logConfig.maxFiles - 1; i >= 0; i--) {
      const currentPath = i === 0 ? mainLogPath : path.join(logDir, `molt-os.log.${i}`);
      const nextPath = path.join(logDir, `molt-os.log.${i + 1}`);

      if (fs.existsSync(currentPath)) {
        if (i === logConfig.maxFiles - 1) {
          fs.unlinkSync(currentPath);
        } else {
          fs.renameSync(currentPath, nextPath);
        }
      }
    }
  } catch (error) {
    console.error("Log rotation failed:", error);
  }
}

export function getLogger(options?: LoggerOptions): Logger<ILogObj> {
  if (loggerInstance) {
    return loggerInstance;
  }

  ensureLogDirectory();

  const type = logConfig.jsonFormat ? "json" : "pretty";

  const settings: ISettingsParam<ILogObj> = {
    name: "molt-os",
    type,
    minLevel: logConfig.level,
    ...options,
  };

  loggerInstance = new Logger<ILogObj>(settings);

  setupLogRotation();

  loggerInstance.info("Logger initialized", {
    level: logConfig.level,
    logPath: logConfig.logPath,
  });

  return loggerInstance;
}

export function createLogger(name: string, options?: LoggerOptions): Logger<ILogObj> {
  const type = logConfig.jsonFormat ? "json" : "pretty";

  return new Logger<ILogObj>({
    name,
    type,
    minLevel: logConfig.level,
    ...options,
  });
}

export function createChildLogger(name: string): Logger<ILogObj> {
  const parentLogger = getLogger();
  return parentLogger.getSubLogger({ name });
}

export function setLogLevel(level: LogLevel): void {
  logConfig.level = level;
  if (loggerInstance) {
    loggerInstance.setSettings({ minLevel: level });
  }
}

export function getLogLevel(): LogLevel {
  return logConfig.level;
}

export function logWithContext(
  level: LogLevel,
  message: string,
  context: Record<string, unknown>,
): void {
  const logger = getLogger();
  (logger as unknown as Record<string, unknown>)[level](message, context);
}

export function shutdownLogger(): Promise<void> {
  return new Promise((resolve) => {
    if (logRotationInterval) {
      clearInterval(logRotationInterval);
    }
    if (loggerInstance) {
      loggerInstance.info("Logger shutting down");
    }
    resolve();
  });
}

export function getLogFilePath(): string {
  return path.join(logConfig.logPath, "molt-os.log");
}

export { Logger };
