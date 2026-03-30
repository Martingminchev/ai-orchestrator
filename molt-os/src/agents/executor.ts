// Agent Executor - The core tool-calling loop for agents

import type { KimiMessage, ToolDefinition, ToolCall, ChatWithToolsResult } from "../models/types.js";
import { KimiClient } from "../models/kimi.js";
import type { ToolExecutor, ToolOutput } from "../tools/types.js";
import { getLogger } from "../utils/logger.js";

export interface ExecutorConfig {
  maxIterations: number;
  timeout: number;
  model?: string;
}

export interface ExecutorResult {
  success: boolean;
  output: string;
  iterations: number;
  toolsUsed: string[];
  totalTokens: number;
  error?: string;
}

export interface ExecutorCallbacks {
  onIteration?: (iteration: number, message: KimiMessage) => void;
  onToolCall?: (toolCall: ToolCall, result: ToolOutput) => void;
  onComplete?: (result: ExecutorResult) => void;
}

export class AgentExecutor {
  private client: KimiClient;
  private config: ExecutorConfig;
  private tools: Map<string, ToolExecutor> = new Map();
  private toolDefinitions: ToolDefinition[] = [];
  private logger = getLogger();

  constructor(client: KimiClient, config: ExecutorConfig) {
    this.client = client;
    this.config = config;
  }

  registerTool(executor: ToolExecutor): void {
    const def = executor.getDefinition();
    this.tools.set(def.name, executor);
    this.toolDefinitions.push({
      type: "function",
      function: {
        name: def.name,
        description: def.description,
        parameters: {
          type: "object",
          properties: def.inputSchema.properties as Record<string, { type: "string" | "number" | "boolean" | "array" | "object"; description?: string }>,
          required: def.inputSchema.required,
        },
      },
    });
  }

  registerTools(executors: ToolExecutor[]): void {
    for (const executor of executors) {
      this.registerTool(executor);
    }
  }

  async execute(
    systemPrompt: string,
    userPrompt: string,
    callbacks?: ExecutorCallbacks
  ): Promise<ExecutorResult> {
    const messages: KimiMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const toolsUsed: string[] = [];
    let totalTokens = 0;
    let iteration = 0;
    let lastContent = "";

    try {
      while (iteration < this.config.maxIterations) {
        iteration++;

        const result = await this.client.chatWithTools(
          messages,
          this.toolDefinitions.length > 0 ? this.toolDefinitions : undefined,
          { temperature: 0.7 }
        );

        totalTokens += result.usage.total_tokens;

        // Add assistant message to history
        const assistantMessage: KimiMessage = {
          role: "assistant",
          content: result.content ?? null,
          tool_calls: result.toolCalls,
        };
        messages.push(assistantMessage);

        callbacks?.onIteration?.(iteration, assistantMessage);

        // If no tool calls, we're done
        if (!result.toolCalls || result.toolCalls.length === 0) {
          lastContent = result.content || "";
          break;
        }

        // Execute tool calls
        const toolResults = await this.executeToolCalls(result.toolCalls, callbacks);
        
        for (const tc of result.toolCalls) {
          if (!toolsUsed.includes(tc.function.name)) {
            toolsUsed.push(tc.function.name);
          }
        }

        // Add tool results to messages
        for (const tr of toolResults) {
          messages.push({
            role: "tool",
            content: tr.error ? `Error: ${tr.error}` : (typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result)),
            tool_call_id: tr.toolCallId,
          });
        }

        // Check for stop conditions
        if (result.finishReason === "stop") {
          lastContent = result.content || "";
          break;
        }
      }

      const executorResult: ExecutorResult = {
        success: true,
        output: lastContent,
        iterations: iteration,
        toolsUsed,
        totalTokens,
      };

      callbacks?.onComplete?.(executorResult);
      return executorResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Agent execution failed", { error: errorMessage, iteration });

      return {
        success: false,
        output: "",
        iterations: iteration,
        toolsUsed,
        totalTokens,
        error: errorMessage,
      };
    }
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    callbacks?: ExecutorCallbacks
  ): Promise<Array<{ toolCallId: string; result?: unknown; error?: string }>> {
    const results: Array<{ toolCallId: string; result?: unknown; error?: string }> = [];

    for (const toolCall of toolCalls) {
      const tool = this.tools.get(toolCall.function.name);

      if (!tool) {
        results.push({
          toolCallId: toolCall.id,
          error: `Unknown tool: ${toolCall.function.name}`,
        });
        continue;
      }

      try {
        const args = JSON.parse(toolCall.function.arguments);
        const output = await tool.execute(args);

        callbacks?.onToolCall?.(toolCall, output);

        results.push({
          toolCallId: toolCall.id,
          result: output.success ? output.result : undefined,
          error: output.success ? undefined : output.error,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          toolCallId: toolCall.id,
          error: errorMessage,
        });
      }
    }

    return results;
  }
}

export function createAgentExecutor(client: KimiClient, config?: Partial<ExecutorConfig>): AgentExecutor {
  return new AgentExecutor(client, {
    maxIterations: config?.maxIterations ?? 50,
    timeout: config?.timeout ?? 300000,
    model: config?.model,
  });
}
