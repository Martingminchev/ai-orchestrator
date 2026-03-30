export enum MoltErrorCode {
  UNKNOWN = "UNKNOWN",
  CONFIG_ERROR = "CONFIG_ERROR",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  IPC_ERROR = "IPC_ERROR",
  WORKER_ERROR = "WORKER_ERROR",
  PLANNER_ERROR = "PLANNER_ERROR",
  SUBAGENT_ERROR = "SUBAGENT_ERROR",
  TIMEOUT = "TIMEOUT",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONTEXT_ERROR = "CONTEXT_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  DAEMON_ERROR = "DAEMON_ERROR",
  ELECTRON_ERROR = "ELECTRON_ERROR",
}

export interface MoltErrorOptions {
  code: MoltErrorCode;
  message: string;
  cause?: Error;
  context?: Record<string, unknown>;
  recoverable?: boolean;
  retryAfter?: number;
}

export class MoltError extends Error {
  code: MoltErrorCode;
  cause?: Error;
  context?: Record<string, unknown>;
  recoverable: boolean;
  retryAfter?: number;

  constructor(options: MoltErrorOptions) {
    super(options.message);
    this.name = "MoltError";
    this.code = options.code;
    this.cause = options.cause;
    this.context = options.context;
    this.recoverable = options.recoverable ?? false;
    this.retryAfter = options.retryAfter;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      retryAfter: this.retryAfter,
      stack: this.stack,
    };
  }
}

export function createError(
  code: MoltErrorCode,
  message: string,
  options?: Partial<MoltErrorOptions>,
): MoltError {
  return new MoltError({
    code,
    message,
    recoverable: false,
    ...options,
  });
}

export function isMoltError(error: unknown): error is MoltError {
  return (
    error instanceof MoltError || (typeof error === "object" && error !== null && "code" in error)
  );
}

export function getErrorCode(error: unknown): MoltErrorCode {
  if (isMoltError(error)) {
    return error.code;
  }
  if (error instanceof Error) {
    return MoltErrorCode.UNKNOWN;
  }
  return MoltErrorCode.UNKNOWN;
}
