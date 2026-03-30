import { describe, it, expect } from "vitest";
import { MoltError, MoltErrorCode, createError, isMoltError } from "./src/error/types.js";

describe("Error Types", () => {
  describe("MoltError", () => {
    it("should create error with all properties", () => {
      const cause = new Error("Original error");
      const error = new MoltError({
        code: MoltErrorCode.WORKER_ERROR,
        message: "Worker failed",
        cause,
        context: { taskId: "123" },
        recoverable: true,
        retryAfter: 5000,
      });

      expect(error.code).toBe(MoltErrorCode.WORKER_ERROR);
      expect(error.message).toBe("Worker failed");
      expect(error.cause).toBe(cause);
      expect(error.context?.taskId).toBe("123");
      expect(error.recoverable).toBe(true);
      expect(error.retryAfter).toBe(5000);
    });

    it("should convert to JSON", () => {
      const error = new MoltError({
        code: MoltErrorCode.CONFIG_ERROR,
        message: "Config error",
      });

      const json = error.toJSON();
      expect(json.code).toBe(MoltErrorCode.CONFIG_ERROR);
      expect(json.message).toBe("Config error");
      expect(json.recoverable).toBe(false);
    });
  });

  describe("createError", () => {
    it("should create error with default options", () => {
      const error = createError(MoltErrorCode.TIMEOUT, "Operation timed out");
      expect(error.code).toBe(MoltErrorCode.TIMEOUT);
      expect(error.message).toBe("Operation timed out");
      expect(error.recoverable).toBe(false);
    });

    it("should create error with custom options", () => {
      const error = createError(MoltErrorCode.IPC_ERROR, "IPC failure", {
        recoverable: true,
        context: { channel: "test" },
      });
      expect(error.recoverable).toBe(true);
      expect(error.context?.channel).toBe("test");
    });
  });

  describe("isMoltError", () => {
    it("should return true for MoltError", () => {
      const error = new MoltError({
        code: MoltErrorCode.UNKNOWN,
        message: "Test",
      });
      expect(isMoltError(error)).toBe(true);
    });

    it("should return true for object with code", () => {
      const error = { code: MoltErrorCode.FILE_NOT_FOUND, message: "Test" } as unknown;
      expect(isMoltError(error)).toBe(true);
    });

    it("should return false for regular Error", () => {
      const error = new Error("Regular error");
      expect(isMoltError(error)).toBe(false);
    });
  });
});
