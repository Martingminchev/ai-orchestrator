import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileAgent } from "../file-agent/index.js";
import type { AgentTask } from "../agents/types.js";

describe("FileAgent", () => {
  let agent: FileAgent;

  beforeEach(() => {
    agent = new FileAgent();
  });

  afterEach(() => {
    agent.reset();
  });

  describe("execute", () => {
    it("should return error for unknown operation", async () => {
      const task: AgentTask = {
        id: "test-1",
        agentType: "file",
        prompt: "perform some unknown action",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown file operation");
    });
  });

  describe("handleRead", () => {
    it("should return error when no file path provided", async () => {
      const task: AgentTask = {
        id: "test-2",
        agentType: "file",
        prompt: "read",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No file path provided");
    });
  });

  describe("handleWrite", () => {
    it("should return error when no content provided", async () => {
      const task: AgentTask = {
        id: "test-4",
        agentType: "file",
        prompt: "write to /tmp/test.txt",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No content provided");
    });
  });

  describe("handleList", () => {
    it("should list directory contents", async () => {
      const task: AgentTask = {
        id: "test-5",
        agentType: "file",
        prompt: "list .",
        context: {
          cwd: process.cwd(),
        },
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("entries");
      expect(result.metadata).toHaveProperty("path");
    });
  });

  describe("handleSearch", () => {
    it("should search for files using pattern", async () => {
      const task: AgentTask = {
        id: "test-6",
        agentType: "file",
        prompt: "search **/*.ts",
        context: {
          cwd: process.cwd(),
        },
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("pattern");
      expect(result.metadata).toHaveProperty("matches");
      expect(result.metadata).toHaveProperty("count");
    });
  });

  describe("state management", () => {
    it("should reset state correctly", async () => {
      expect(agent.state.messages.length).toBe(0);
      expect(agent.state.iterations).toBe(0);
      expect(agent.state.completed).toBe(false);

      agent.reset();

      expect(agent.state.messages.length).toBe(0);
      expect(agent.state.iterations).toBe(0);
      expect(agent.state.completed).toBe(false);
    });

    it("should have correct initial config", () => {
      expect(agent.config.name).toBe("File Agent");
      expect(agent.config.type).toBe("file");
      expect(agent.config.capabilities.length).toBeGreaterThan(0);
    });
  });
});
