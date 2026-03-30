import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SystemAgent } from "../system-agent/index.js";
import type { AgentTask } from "../agents/types.js";

describe("SystemAgent", () => {
  let agent: SystemAgent;

  beforeEach(() => {
    agent = new SystemAgent();
  });

  afterEach(() => {
    agent.reset();
  });

  describe("execute", () => {
    it("should return error for unknown operation", async () => {
      const task: AgentTask = {
        id: "test-1",
        agentType: "system",
        prompt: "perform some unknown action",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown system operation");
    });
  });

  describe("handleRunCommand", () => {
    it("should execute echo command", async () => {
      const task: AgentTask = {
        id: "test-3",
        agentType: "system",
        prompt: 'run echo "hello"',
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("command");
      expect(result.metadata).toHaveProperty("stdout");
    });
  });

  describe("handleCheckStatus", () => {
    it("should return system status", async () => {
      const task: AgentTask = {
        id: "test-5",
        agentType: "system",
        prompt: "check status of system",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("status");
      expect(result.metadata).toHaveProperty("details");
      expect(result.metadata.details).toHaveProperty("platform");
      expect(result.metadata.details).toHaveProperty("nodeVersion");
    });
  });

  describe("handleMonitorResources", () => {
    it("should return resource metrics", async () => {
      const task: AgentTask = {
        id: "test-6",
        agentType: "system",
        prompt: "monitor resources",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("metrics");
      expect(result.metadata.metrics).toHaveProperty("cpu");
      expect(result.metadata.metrics).toHaveProperty("memory");
    });
  });

  describe("handleAutomateTasks", () => {
    it("should return automation configuration", async () => {
      const task: AgentTask = {
        id: "test-7",
        agentType: "system",
        prompt: "automate tasks",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("tasks");
      expect(result.metadata).toHaveProperty("scheduled");
    });
  });

  describe("handleScheduleJobs", () => {
    it("should return job scheduling confirmation", async () => {
      const task: AgentTask = {
        id: "test-8",
        agentType: "system",
        prompt: 'schedule cron "0 * * * * *"',
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("schedule");
      expect(result.metadata).toHaveProperty("jobId");
      expect(result.metadata).toHaveProperty("scheduled");
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
      expect(agent.config.name).toBe("System Agent");
      expect(agent.config.type).toBe("system");
      expect(agent.config.capabilities.length).toBeGreaterThan(0);
    });
  });
});
