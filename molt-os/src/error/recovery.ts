import { getLogger } from "../utils/logger.js";
import { MoltError, MoltErrorCode, isMoltError } from "./types.js";

export interface RecoveryResult {
  success: boolean;
  recovered: boolean;
  action: string;
  message: string;
  data?: unknown;
}

export type RecoveryStrategy = () => Promise<RecoveryResult>;

const recoveryStrategies: Map<MoltErrorCode, RecoveryStrategy[]> = new Map();

export function registerRecoveryStrategy(
  errorCode: MoltErrorCode,
  strategy: RecoveryStrategy,
): void {
  const strategies = recoveryStrategies.get(errorCode) || [];
  strategies.push(strategy);
  recoveryStrategies.set(errorCode, strategies);
}

export function getRecoveryStrategies(errorCode: MoltErrorCode): RecoveryStrategy[] {
  return recoveryStrategies.get(errorCode) || [];
}

export async function attemptRecovery(
  error: MoltError,
  maxRetries: number = 3,
): Promise<RecoveryResult> {
  const logger = getLogger();

  logger.warn("Attempting recovery", {
    errorCode: error.code,
    message: error.message,
    recoverable: error.recoverable,
    maxRetries,
  });

  const strategies = getRecoveryStrategies(error.code);

  if (strategies.length === 0) {
    return {
      success: false,
      recovered: false,
      action: "none",
      message: "No recovery strategies available",
    };
  }

  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result.success && result.recovered) {
        logger.info("Recovery successful", { action: result.action });
        return result;
      }
    } catch (recoveryError) {
      logger.error("Recovery strategy failed", { recoveryError });
    }
  }

  return {
    success: false,
    recovered: false,
    action: "exhausted",
    message: "All recovery strategies exhausted",
  };
}

registerRecoveryStrategy(MoltErrorCode.CONFIG_ERROR, async () => {
  const { loadConfig } = await import("../config/load.js");
  try {
    loadConfig();
    return {
      success: true,
      recovered: true,
      action: "reload_config",
      message: "Configuration reloaded successfully",
    };
  } catch {
    return {
      success: false,
      recovered: false,
      action: "reload_config",
      message: "Failed to reload configuration",
    };
  }
});

registerRecoveryStrategy(MoltErrorCode.FILE_NOT_FOUND, async () => {
  return {
    success: false,
    recovered: false,
    action: "file_not_found",
    message: "File not found - manual intervention required",
  };
});

registerRecoveryStrategy(MoltErrorCode.TIMEOUT, async () => {
  return {
    success: true,
    recovered: true,
    action: "retry",
    message: "Operation can be retried",
  };
});

registerRecoveryStrategy(MoltErrorCode.NETWORK_ERROR, async () => {
  return {
    success: false,
    recovered: false,
    action: "network_check",
    message: "Check network connectivity and try again",
  };
});

export async function withRecovery<T>(
  operation: () => Promise<T>,
  errorCode: MoltErrorCode,
  fallback?: T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const moltError = isMoltError(error)
      ? error
      : new MoltError({
          code: errorCode,
          message: String(error),
          cause: error as Error,
        });

    const recovery = await attemptRecovery(moltError);

    if (recovery.success && recovery.recovered) {
      return operation();
    }

    if (fallback !== undefined) {
      return fallback;
    }

    throw moltError;
  }
}
