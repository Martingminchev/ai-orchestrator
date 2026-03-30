import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ResearchAgent } from "../research-agent/index.js";
import type { AgentTask } from "../agents/types.js";

describe("ResearchAgent", () => {
  let agent: ResearchAgent;

  beforeEach(() => {
    agent = new ResearchAgent();
  });

  afterEach(() => {
    agent.reset();
  });

  describe("execute", () => {
    it("should return error for unknown operation", async () => {
      const task: AgentTask = {
        id: "test-1",
        agentType: "research",
        prompt: "perform some unknown action",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown research operation");
    });
  });

  describe("handleSummarize", () => {
    it("should summarize content", async () => {
      const task: AgentTask = {
        id: "test-4",
        agentType: "research",
        prompt:
          "summarize this content in medium length: This is a test document with some information that needs to be summarized for brevity.",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("summary");
      expect(result.metadata).toHaveProperty("length");
    });
  });

  describe("handleExtractLinks", () => {
    it("should extract links from content", async () => {
      const task: AgentTask = {
        id: "test-5",
        agentType: "research",
        prompt:
          "extract links from: Visit https://example.com for more info and https://test.org for testing.",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("links");
    });
  });

  describe("handleFindInfo", () => {
    it("should find information in content", async () => {
      const task: AgentTask = {
        id: "test-7",
        agentType: "research",
        prompt:
          "find information about TypeScript in this document: TypeScript is a strongly typed programming language that builds on JavaScript.",
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty("query");
      expect(result.metadata).toHaveProperty("matches");
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
      expect(agent.config.name).toBe("Research Agent");
      expect(agent.config.type).toBe("research");
      expect(agent.config.capabilities.length).toBeGreaterThan(0);
    });
  });
});
