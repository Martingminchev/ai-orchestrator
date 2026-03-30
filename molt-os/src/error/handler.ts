import { getLogger, Logger } from "../utils/logger.js";
import { MoltError, MoltErrorCode, isMoltError, createError } from "./types.js";
import { attemptRecovery } from "./recovery.js";

export interface ErrorHandlerConfig {
  maxErrorsBeforeWarning: number;
  enableErrorReporting: boolean;
  exitOnFatal: boolean;
}

const defaultConfig: ErrorHandlerConfig = {
  maxErrorsBeforeWarning: 5,
  enableErrorReporting: true,
  exitOnFatal: true,
};

let errorCount: number = 0;
let errorHandlerConfig: ErrorHandlerConfig = { ...defaultConfig };

export function configureErrorHandler(config: Partial<ErrorHandlerConfig>): void {
  errorHandlerConfig = { ...errorHandlerConfig, ...config };
}

export function getErrorCount(): number {
  return errorCount;
}

export function resetErrorCount(): void {
  errorCount = 0;
}

export function handleError(error: unknown): void {
  const logger = getLogger();
  errorCount++;

  const moltError = normalizeError(error);

  logger.error("Error occurred", {
    code: moltError.code,
    message: moltError.message,
    recoverable: moltError.recoverable,
    count: errorCount,
    stack: moltError.stack,
  });

  if (errorCount >= errorHandlerConfig.maxErrorsBeforeWarning) {
    logger.warn("High error rate detected", { count: errorCount });
  }

  if (moltError.recoverable) {
    handleRecoverableError(moltError);
  } else {
    handleFatalError(moltError);
  }
}

function normalizeError(error: unknown): MoltError {
  if (isMoltError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new MoltError({
      code: MoltErrorCode.UNKNOWN,
      message: error.message,
      cause: error,
      context: { originalStack: error.stack },
    });
  }

  return new MoltError({
    code: MoltErrorCode.UNKNOWN,
    message: String(error),
  });
}

async function handleRecoverableError(error: MoltError): Promise<void> {
  const logger = getLogger();

  const recovery = await attemptRecovery(error);

  if (recovery.success && recovery.recovered) {
    logger.info("Error recovered", { action: recovery.action });
    return;
  }

  if (error.retryAfter) {
    logger.warn("Retry suggested", { retryAfter: error.retryAfter });
  }
}

function handleFatalError(error: MoltError): void {
  const logger = getLogger();

  logger.error("Fatal error", {
    code: error.code,
    message: error.message,
    stack: error.stack,
  });

  if (errorHandlerConfig.exitOnFatal) {
    logger.info("Exiting due to fatal error");
    process.exit(1);
  }
}

export function installErrorHandler(): void {
  process.on("uncaughtException", (error: Error) => {
    handleError(error);
    if (errorHandlerConfig.exitOnFatal) {
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason: unknown) => {
    handleError(reason);
  });
}

export function createErrorHandler(logger?: Logger): (error: unknown) => void {
  return (error: unknown) => {
    const errorLogger = logger || getLogger();
    errorLogger.error("Handler caught error", { error });
  };
}

export function wrapAsyncFunction<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
      throw error;
    }
  };
}

export function withErrorHandler<T>(operation: () => T, errorMessage: string): T {
  try {
    return operation();
  } catch (error) {
    handleError(error);
    throw createError(
      MoltErrorCode.UNKNOWN,
      `${errorMessage}: ${isMoltError(error) ? error.message : String(error)}`,
    );
  }
}
