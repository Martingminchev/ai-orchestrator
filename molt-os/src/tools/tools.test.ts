import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolExecutorEngine, createToolExecutor } from "./tools/executor.js";
import { ToolSandbox, createSandbox } from "./tools/sandbox.js";
import type { ToolDefinition, ToolInput, ToolOutput } from "./tools/types.js";

describe("Tool Executor", () => {
  let executor: ToolExecutorEngine;

  beforeEach(() => {
    executor = createToolExecutor();
  });

  afterEach(() => {
    executor.clearHistory();
  });

  describe("execute", () => {
    it("should return error for unknown tool", async () => {
      const result = await executor.execute("unknown-tool", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool not found");
    });

    it("should execute a basic tool", async () => {
      const tool = executor.createBasicTool(
        "test-tool",
        "A test tool",
        { input: { type: "string" } },
        async (input) => ({
          success: true,
          result: { processed: input.value },
        }),
      );

      executor.register(tool);

      const result = await executor.execute("test-tool", { value: "test" });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ processed: "test" });
    });
  });

  describe("getToolDefinition", () => {
    it("should return undefined for unknown tool", () => {
      const definition = executor.getToolDefinition("unknown-tool");
      expect(definition).toBeUndefined();
    });
  });

  describe("listTools", () => {
    it("should list registered tools", () => {
      const tool = executor.createBasicTool("list-tool", "A list tool", {}, async () => ({
        success: true,
      }));

      executor.register(tool);

      const tools = executor.listTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe("list-tool");
    });
  });

  describe("execution history", () => {
    it("should record execution history", async () => {
      const tool = executor.createBasicTool("history-tool", "A history tool", {}, async () => ({
        success: true,
      }));

      executor.register(tool);
      await executor.execute("history-tool", {});

      const history = executor.getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].toolName).toBe("history-tool");
    });

    it("should clear history", async () => {
      const tool = executor.createBasicTool("clear-tool", "A clear tool", {}, async () => ({
        success: true,
      }));

      executor.register(tool);
      await executor.execute("clear-tool", {});

      executor.clearHistory();

      const history = executor.getExecutionHistory();
      expect(history.length).toBe(0);
    });
  });
});

describe("Tool Sandbox", () => {
  let sandbox: ToolSandbox;

  beforeEach(() => {
    sandbox = createSandbox({ enabled: true });
  });

  describe("isPathAllowed", () => {
    it("should allow paths when no restrictions", () => {
      const context = sandbox.createContext("/tmp");
      expect(sandbox.isPathAllowed("/tmp/test", context)).toBe(true);
    });

    it("should deny paths in denied list", () => {
      const strictSandbox = createSandbox({
        enabled: true,
        deniedPaths: ["/etc", "/usr/bin"],
      });
      const context = strictSandbox.createContext("/tmp");
      expect(strictSandbox.isPathAllowed("/etc/passwd", context)).toBe(false);
    });

    it("should only allow paths in allowed list", () => {
      const strictSandbox = createSandbox({
        enabled: true,
        allowedPaths: ["/tmp/project"],
      });
      const context = strictSandbox.createContext("/tmp");

      expect(strictSandbox.isPathAllowed("/tmp/project", context)).toBe(true);
      expect(strictSandbox.isPathAllowed("/tmp/other", context)).toBe(false);
    });

    it("should allow all paths when disabled", () => {
      const disabledSandbox = createSandbox({ enabled: false });
      const context = disabledSandbox.createContext("/tmp");

      expect(disabledSandbox.isPathAllowed("/etc/passwd", context)).toBe(true);
    });
  });

  describe("isWithinMemoryLimit", () => {
    it("should be within limit for small memory", () => {
      const context = sandbox.createContext("/tmp");
      expect(sandbox.isWithinMemoryLimit(1024, context)).toBe(true);
    });

    it("should exceed limit for large memory", () => {
      const lowMemorySandbox = createSandbox({
        maxMemory: 1000,
      });
      const context = lowMemorySandbox.createContext("/tmp");
      expect(lowMemorySandbox.isWithinMemoryLimit(2000, context)).toBe(false);
    });
  });

  describe("isWithinFileSizeLimit", () => {
    it("should be within limit for small files", () => {
      const context = sandbox.createContext("/tmp");
      expect(sandbox.isWithinFileSizeLimit(1024, context)).toBe(true);
    });

    it("should exceed limit for large files", () => {
      const lowLimitSandbox = createSandbox({
        maxFileSize: 1000,
      });
      const context = lowLimitSandbox.createContext("/tmp");
      expect(lowLimitSandbox.isWithinFileSizeLimit(2000, context)).toBe(false);
    });
  });

  describe("canAccessNetwork", () => {
    it("should deny network access by default", () => {
      expect(sandbox.canAccessNetwork()).toBe(false);
    });

    it("should allow network access when enabled", () => {
      const networkSandbox = createSandbox({ networkAccess: true });
      expect(networkSandbox.canAccessNetwork()).toBe(true);
    });
  });

  describe("applySecurityPolicies", () => {
    it("should allow safe operations", () => {
      const context = sandbox.createContext("/tmp");
      const result = sandbox.applySecurityPolicies("/tmp/test.txt", "read", context);
      expect(result.allowed).toBe(true);
    });

    it("should deny writes to protected directories", () => {
      const context = sandbox.createContext("/tmp");
      const result = sandbox.applySecurityPolicies("/tmp/project/.git/config", "write", context);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Protected directory");
    });
  });

  describe("wrapTool", () => {
    it("should wrap a tool with sandbox", async () => {
      const tool: any = {
        execute: async (input: ToolInput) => ({ success: true, result: input }),
        validate: () => ({ valid: true, errors: [] }),
        getDefinition: () => ({
          name: "test",
          description: "test",
          inputSchema: { type: "object", properties: {} },
        }),
      };

      const sandboxedTool = sandbox.wrapTool(tool, sandbox.createContext("/tmp"));

      const result = await sandboxedTool.execute({ test: "value" });
      expect(result.success).toBe(true);
      expect(sandboxedTool.isSandboxed()).toBe(true);
    });

    it("should limit execution depth", async () => {
      let depth = 0;
      const tool: any = {
        execute: async (input: any) => {
          if (input.depth >= 10) {
            return { success: true };
          }
          return { success: true };
        },
        validate: () => ({ valid: true, errors: [] }),
        getDefinition: () => ({
          name: "test",
          description: "test",
          inputSchema: { type: "object", properties: {} },
        }),
      };

      const sandboxedTool = sandbox.wrapTool(tool, sandbox.createContext("/tmp"));

      const result = await sandboxedTool.execute({ depth: 11 });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum execution depth exceeded");
    });
  });

  describe("configuration", () => {
    it("should return current config", () => {
      const config = sandbox.getConfig();
      expect(config).toHaveProperty("enabled");
      expect(config).toHaveProperty("maxMemory");
      expect(config).toHaveProperty("maxFileSize");
      expect(config).toHaveProperty("timeout");
    });

    it("should update config", () => {
      sandbox.updateConfig({ maxMemory: 500000000, networkAccess: true });
      const config = sandbox.getConfig();
      expect(config.maxMemory).toBe(500000000);
      expect(config.networkAccess).toBe(true);
    });
  });
});
