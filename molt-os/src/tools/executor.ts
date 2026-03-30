import type {
  ToolDefinition,
  ToolInput,
  ToolOutput,
  ToolExecutor,
  ToolRegistry,
  ToolExecutionContext,
} from "./types.js";

class DefaultToolRegistry implements ToolRegistry {
  private tools: Map<string, ToolExecutor> = new Map();

  register(tool: ToolExecutor): void {
    const definition = tool.getDefinition();
    this.tools.set(definition.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolExecutor | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.getDefinition());
  }

  clear(): void {
    this.tools.clear();
  }
}

export class ToolExecutorEngine {
  private registry: ToolRegistry;
  private executionHistory: Array<{
    toolName: string;
    input: ToolInput;
    output: ToolOutput;
    timestamp: Date;
  }>;

  constructor(registry?: ToolRegistry) {
    this.registry = registry || new DefaultToolRegistry();
    this.executionHistory = [];
  }

  async execute(
    toolName: string,
    input: ToolInput,
    context?: Partial<ToolExecutionContext>,
  ): Promise<ToolOutput> {
    const tool = this.registry.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`,
      };
    }

    const validation = tool.validate(input);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid input: ${validation.errors.join(", ")}`,
      };
    }

    const startTime = Date.now();

    try {
      const output = await tool.execute(input);

      const metadata = {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        toolName,
      };

      this.executionHistory.push({
        toolName,
        input,
        output: { ...output, metadata },
        timestamp: new Date(),
      });

      return { ...output, metadata };
    } catch (error) {
      const errorOutput: ToolOutput = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          toolName,
        },
      };

      this.executionHistory.push({
        toolName,
        input,
        output: errorOutput,
        timestamp: new Date(),
      });

      return errorOutput;
    }
  }

  register(tool: ToolExecutor): void {
    this.registry.register(tool);
  }

  getToolDefinition(name: string): ToolDefinition | undefined {
    return this.registry.get(name)?.getDefinition();
  }

  listTools(): ToolDefinition[] {
    return this.registry.list();
  }

  getExecutionHistory() {
    return [...this.executionHistory];
  }

  clearHistory(): void {
    this.executionHistory = [];
  }

  createBasicTool<T extends ToolInput>(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (input: T) => Promise<ToolOutput>,
  ): ToolExecutor {
    return {
      execute: (input: ToolInput) => handler(input as T),
      validate: (input: ToolInput) => ({
        valid: true,
        errors: [],
      }),
      getDefinition: () => ({
        name,
        description,
        inputSchema: {
          type: "object",
          properties: schema,
        },
      }),
    };
  }
}

export function createToolExecutor(registry?: ToolRegistry): ToolExecutorEngine {
  return new ToolExecutorEngine(registry);
}

export default ToolExecutorEngine;
