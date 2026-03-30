import { describe, it, expect } from "vitest";
import { IpcMessageType, IpcMessage } from "./src/ipc/types.js";

describe("IPC Types", () => {
  describe("IpcMessageType", () => {
    it("should have all required message types", () => {
      expect(IpcMessageType.TASK_REQUEST).toBe("TASK_REQUEST");
      expect(IpcMessageType.TASK_RESPONSE).toBe("TASK_RESPONSE");
      expect(IpcMessageType.PLAN_REQUEST).toBe("PLAN_REQUEST");
      expect(IpcMessageType.PLAN_RESPONSE).toBe("PLAN_RESPONSE");
      expect(IpcMessageType.SUBAGENT_START).toBe("SUBAGENT_START");
      expect(IpcMessageType.SUBAGENT_RESULT).toBe("SUBAGENT_RESULT");
      expect(IpcMessageType.PROGRESS_UPDATE).toBe("PROGRESS_UPDATE");
      expect(IpcMessageType.ERROR).toBe("ERROR");
      expect(IpcMessageType.HEARTBEAT).toBe("HEARTBEAT");
      expect(IpcMessageType.SHUTDOWN).toBe("SHUTDOWN");
    });
  });

  describe("IpcMessage", () => {
    it("should have required properties", () => {
      const message: IpcMessage = {
        type: IpcMessageType.TASK_REQUEST,
        taskId: "task-123",
        payload: { data: "test" },
        timestamp: Date.now(),
        messageId: "msg-456",
        source: "orchestrator",
        target: "worker",
      };

      expect(message.type).toBe(IpcMessageType.TASK_REQUEST);
      expect(message.taskId).toBe("task-123");
      expect(message.payload).toEqual({ data: "test" });
      expect(message.source).toBe("orchestrator");
      expect(message.target).toBe("worker");
    });
  });
});
