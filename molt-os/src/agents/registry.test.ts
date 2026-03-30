import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAgent,
  getAgentConfig,
  listAgentTypes,
  listAgentConfigs,
  isRegisteredAgent,
  executeAgent,
  registerCustomAgent,
} from "./agents/registry.js";
import type { AgentTask, AgentType } from "./agents/types.js";
import { AgentFactory, createAgentFactory } from "./agents/factory.js";

describe("Agent Registry", () => {
  describe("getAgent", () => {
    it("should return FileAgent for file type", () => {
      const agent = getAgent("file");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("file");
    });

    it("should return ResearchAgent for research type", () => {
      const agent = getAgent("research");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("research");
    });

    it("should return CodeAgent for code type", () => {
      const agent = getAgent("code");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("code");
    });

    it("should return SystemAgent for system type", () => {
      const agent = getAgent("system");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("system");
    });

    it("should return undefined for unknown type", () => {
      const agent = getAgent("unknown" as AgentType);
      expect(agent).toBeUndefined();
    });
  });

  describe("getAgentConfig", () => {
    it("should return config for file agent", () => {
      const config = getAgentConfig("file");
      expect(config).toBeDefined();
      expect(config?.name).toBe("File Agent");
    });

    it("should return config for research agent", () => {
      const config = getAgentConfig("research");
      expect(config).toBeDefined();
      expect(config?.name).toBe("Research Agent");
    });

    it("should return undefined for unknown type", () => {
      const config = getAgentConfig("unknown" as AgentType);
      expect(config).toBeUndefined();
    });
  });

  describe("listAgentTypes", () => {
    it("should return all agent types", () => {
      const types = listAgentTypes();
      expect(types).toContain("file");
      expect(types).toContain("research");
      expect(types).toContain("code");
      expect(types).toContain("system");
      expect(types.length).toBe(4);
    });
  });

  describe("listAgentConfigs", () => {
    it("should return all agent configs", () => {
      const configs = listAgentConfigs();
      expect(configs.length).toBe(4);
      expect(configs.some((c) => c.type === "file")).toBe(true);
      expect(configs.some((c) => c.type === "research")).toBe(true);
      expect(configs.some((c) => c.type === "code")).toBe(true);
      expect(configs.some((c) => c.type === "system")).toBe(true);
    });
  });

  describe("isRegisteredAgent", () => {
    it("should return true for registered types", () => {
      expect(isRegisteredAgent("file")).toBe(true);
      expect(isRegisteredAgent("research")).toBe(true);
      expect(isRegisteredAgent("code")).toBe(true);
      expect(isRegisteredAgent("system")).toBe(true);
    });

    it("should return false for unregistered types", () => {
      expect(isRegisteredAgent("unknown")).toBe(false);
      expect(isRegisteredAgent("custom")).toBe(false);
    });
  });

  describe("executeAgent", () => {
    it("should execute file agent task", async () => {
      const task: AgentTask = {
        id: "test-1",
        agentType: "file",
        prompt: "list .",
        context: {
          cwd: process.cwd(),
        },
      };

      const result = await executeAgent("file", task);

      expect(result.success).toBe(true);
    });

    it("should return error for unknown agent type", async () => {
      const task: AgentTask = {
        id: "test-2",
        agentType: "unknown" as AgentType,
        prompt: "test",
      };

      const result = await executeAgent("unknown" as AgentType, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown agent type");
    });
  });

  describe("registerCustomAgent", () => {
    it("should register a custom agent", () => {
      const result = registerCustomAgent(
        "custom",
        {
          name: "Custom Agent",
          type: "custom" as AgentType,
          description: "A custom agent",
          capabilities: [],
        },
        () => {
          const { BaseAgent } = require("./agents/base.js");
          return new BaseAgent({
            name: "Custom Agent",
            type: "custom" as AgentType,
            description: "A custom agent",
            capabilities: [],
          });
        },
      );

      expect(result).toBe(true);
      expect(isRegisteredAgent("custom")).toBe(true);
    });

    it("should not re-register existing agent", () => {
      const result = registerCustomAgent(
        "file",
        {
          name: "Duplicate Agent",
          type: "file" as AgentType,
          description: "A duplicate agent",
          capabilities: [],
        },
        () => {
          return getAgent("file")!;
        },
      );

      expect(result).toBe(false);
    });
  });
});

describe("Agent Factory", () => {
  let factory: AgentFactory;

  beforeEach(() => {
    factory = createAgentFactory();
  });

  describe("create", () => {
    it("should create file agent", () => {
      const agent = factory.create("file");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("file");
    });

    it("should create agent with custom max iterations", () => {
      const customFactory = createAgentFactory({ maxIterations: 50 });
      const agent = customFactory.create("file");
      expect(agent?.config.maxIterations).toBe(50);
    });
  });

  describe("createWithConfig", () => {
    it("should create agent with custom config", () => {
      const agent = factory.createWithConfig({
        name: "Custom File Agent",
        type: "file",
        description: "Custom description",
        capabilities: ["Custom capability"],
      });

      expect(agent).toBeDefined();
      expect(agent?.config.name).toBe("Custom File Agent");
      expect(agent?.config.capabilities).toContain("Custom capability");
    });
  });

  describe("execute", () => {
    it("should execute agent task with default timeout", async () => {
      const task: AgentTask = {
        id: "test-1",
        agentType: "file",
        prompt: "list .",
        context: {
          cwd: process.cwd(),
        },
      };

      const result = await factory.execute("file", task);

      expect(result.success).toBe(true);
    });

    it("should execute agent task with custom timeout", async () => {
      const task: AgentTask = {
        id: "test-2",
        agentType: "file",
        prompt: "list .",
        context: {
          cwd: process.cwd(),
        },
      };

      const result = await factory.execute("file", task, 5000);

      expect(result.success).toBe(true);
    });

    it("should return error for unknown agent type", async () => {
      const task: AgentTask = {
        id: "test-3",
        agentType: "unknown" as AgentType,
        prompt: "test",
      };

      const result = await factory.execute("unknown" as AgentType, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown agent type");
    });
  });

  describe("listAvailableAgents", () => {
    it("should list all available agents", () => {
      const agents = factory.listAvailableAgents();
      expect(agents.length).toBe(4);
      expect(agents).toContain("file");
      expect(agents).toContain("research");
      expect(agents).toContain("code");
      expect(agents).toContain("system");
    });
  });

  describe("listAgentDetails", () => {
    it("should list agent details", () => {
      const details = factory.listAgentDetails();
      expect(details.length).toBe(4);
      expect(details[0]).toHaveProperty("type");
      expect(details[0]).toHaveProperty("config");
    });
  });

  describe("isValidAgentType", () => {
    it("should return true for valid types", () => {
      expect(factory.isValidAgentType("file")).toBe(true);
      expect(factory.isValidAgentType("code")).toBe(true);
    });

    it("should return false for invalid types", () => {
      expect(factory.isValidAgentType("invalid")).toBe(false);
    });
  });

  describe("createAgentByName", () => {
    it("should create agent by type name", () => {
      const agent = factory.createAgentByName("file");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("file");
    });

    it("should create agent by display name", () => {
      const agent = factory.createAgentByName("File Agent");
      expect(agent).toBeDefined();
      expect(agent?.config.type).toBe("file");
    });

    it("should return undefined for unknown name", () => {
      const agent = factory.createAgentByName("Unknown Agent");
      expect(agent).toBeUndefined();
    });
  });
});
