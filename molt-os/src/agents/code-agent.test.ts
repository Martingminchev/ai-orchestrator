import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodeAgent } from "../code-agent/index.js";
import type { AgentTask } from "../agents/types.js";

describe("CodeAgent", () => {
  let agent: CodeAgent;

  beforeEach(() => {
    agent = new CodeAgent();
  });

  afterEach(() => {
    agent.reset();
  });

  describe("execute", () => {
    it("should return error for unknown operation", async () => {
      const task: AgentTask = {
        id: "test-1",
        agentType: "code",
        prompt: "perform some unknown action",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown code operation");
    });
  });

  describe("handleGenerateCode", () => {
    it("should generate code from specification", async () => {
      const task: AgentTask = {
        id: "test-5",
        agentType: "code",
        prompt: "generate a function that calculates factorial",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("specification");
      expect(result.metadata).toHaveProperty("language");
      expect(result.metadata).toHaveProperty("code");
    });
  });

  describe("handleLintCode", () => {
    it("should lint code", async () => {
      const task: AgentTask = {
        id: "test-7",
        agentType: "code",
        prompt: "lint /tmp/test.ts",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("path");
      expect(result.metadata).toHaveProperty("fix");
      expect(result.metadata).toHaveProperty("issues");
    });
  });

  describe("handleAnalyzeCode", () => {
    it("should analyze code", async () => {
      const task: AgentTask = {
        id: "test-6",
        agentType: "code",
        prompt: "analyze /tmp/test.ts",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("path");
      expect(result.metadata).toHaveProperty("issues");
      expect(result.metadata).toHaveProperty("score");
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
      expect(agent.config.name).toBe("Code Agent");
      expect(agent.config.type).toBe("code");
      expect(agent.config.capabilities.length).toBeGreaterThan(0);
    });
  });
});
