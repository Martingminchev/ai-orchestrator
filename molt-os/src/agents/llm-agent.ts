// LLM Agent Base
// Base class for agents that use the AgentExecutor for LLM-based tool calling

import type {
  AgentConfig,
  AgentResult,
  AgentTask,
  BaseAgentInterface,
} from "./types.js";
import type { ToolExecutor } from "../tools/types.js";
import { AgentExecutor, createAgentExecutor, ExecutorResult } from "./executor.js";
import { KimiClient, createKimiClient } from "../models/kimi.js";
import { sessionRegistry, buildOrchestratorKey, createChildKey } from "../session/index.js";
import { createStatsTracker } from "../worker/announce/stats.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

export interface LLMAgentConfig extends AgentConfig {
  model?: string;
  maxIterations?: number;
  timeout?: number;
}

export abstract class LLMAgent implements BaseAgentInterface {
  public config: LLMAgentConfig;
  protected client: KimiClient;
  protected executor: AgentExecutor;
  protected sessionKey?: string;
  protected tools: ToolExecutor[] = [];

  constructor(config: LLMAgentConfig, client?: KimiClient) {
    this.config = config;
    this.client = client || createKimiClient({ model: config.model || "k2.5" });
    this.executor = createAgentExecutor(this.client, {
      maxIterations: config.maxIterations ?? 50,
      timeout: config.timeout ?? 300000,
      model: config.model,
    });

    // Register tools
    const tools = this.getTools();
    this.tools = tools;
    this.executor.registerTools(tools);
  }

  /**
   * Get the tools this agent can use - to be implemented by subclasses
   */
  abstract getTools(): ToolExecutor[];

  /**
   * Get the system prompt for this agent - can be overridden
   */
  protected getSystemPrompt(task: AgentTask): string {
    return `You are a ${this.config.name} agent.

## Description
${this.config.description}

## Capabilities
${this.config.capabilities.map((c) => `- ${c}`).join("\n")}

## Guidelines
- Execute tasks efficiently and safely
- Use the available tools to accomplish your goals
- Report errors clearly
- When complete, provide a summary of what was done

${task.context?.cwd ? `## Working Directory\n${task.context.cwd}` : ""}
`;
  }

  /**
   * Execute a task using the LLM with tool calling
   */
  async execute(task: AgentTask): Promise<AgentResult> {
    const stats = createStatsTracker(this.config.model);
    
    // Create session
    const parentKey = task.context?.sessionKey as string | undefined;
    if (parentKey) {
      this.sessionKey = createChildKey(parentKey, "agent") || undefined;
      if (this.sessionKey) {
        sessionRegistry.createSession(
          this.sessionKey,
          "agent",
          parentKey,
          task.id,
          this.config.type
        );
      }
    }

    logger.info(`Executing ${this.config.type} agent task`, { taskId: task.id });

    try {
      const systemPrompt = this.getSystemPrompt(task);
      const userPrompt = task.prompt;

      const result = await this.executor.execute(systemPrompt, userPrompt, {
        onIteration: (iteration, message) => {
          stats.recordIteration();
          logger.debug(`${this.config.type} iteration ${iteration}`, {
            hasToolCalls: !!message.tool_calls?.length,
          });
        },
        onToolCall: (toolCall, output) => {
          stats.recordToolCall(toolCall.function.name);
          if (!output.success) {
            stats.recordError();
          }
          logger.debug(`Tool call: ${toolCall.function.name}`, {
            success: output.success,
          });
        },
      });

      const finalStats = stats.complete();

      // Update session
      if (this.sessionKey) {
        if (result.success) {
          sessionRegistry.completeSession(this.sessionKey, {
            iterations: result.iterations,
            toolsUsed: result.toolsUsed,
            tokens: result.totalTokens,
          });
        } else {
          sessionRegistry.failSession(this.sessionKey, result.error);
        }
      }

      logger.info(`${this.config.type} agent completed`, {
        success: result.success,
        iterations: result.iterations,
        tools: result.toolsUsed.length,
      });

      return this.formatResult(result, finalStats);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (this.sessionKey) {
        sessionRegistry.failSession(this.sessionKey, errorMessage);
      }

      logger.error(`${this.config.type} agent failed`, { error: errorMessage });

      return {
        success: false,
        output: "",
        error: errorMessage,
        metadata: {
          agentType: this.config.type,
          agentName: this.config.name,
        },
      };
    }
  }

  /**
   * Format the executor result into an agent result
   */
  protected formatResult(result: ExecutorResult, stats: any): AgentResult {
    return {
      success: result.success,
      output: result.output,
      error: result.error,
      metadata: {
        agentType: this.config.type,
        agentName: this.config.name,
        iterations: result.iterations,
        toolsUsed: result.toolsUsed,
        totalTokens: result.totalTokens,
        runtime: stats.runtime?.endTime 
          ? stats.runtime.endTime - stats.runtime.startTime 
          : undefined,
      },
    };
  }

  /**
   * Reset the agent state
   */
  reset(): void {
    this.sessionKey = undefined;
  }

  /**
   * Get the session key
   */
  getSessionKey(): string | undefined {
    return this.sessionKey;
  }
}
