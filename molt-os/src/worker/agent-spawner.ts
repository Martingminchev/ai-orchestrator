// Agent Spawner - In-process agent execution using AgentExecutor
// Replaces the child process-based SubagentSpawner with direct AgentExecutor integration

import type { SubagentConfig, SubagentResult } from "./types.js";
import type { AgentType } from "../agents/types.js";
import { AgentExecutor, createAgentExecutor } from "../agents/executor.js";
import { KimiClient, createKimiClient } from "../models/kimi.js";
import { sessionRegistry, createChildKey } from "../session/index.js";
import { createContextGuard, ContextGuard } from "../context/context-guard.js";
import { createStatsTracker, StatsTracker } from "./announce/stats.js";
import { buildSubagentSystemPrompt, buildUserPrompt } from "./announce/system-prompt.js";
import { announceQueue } from "./announce/queue.js";
import { getLogger } from "../utils/logger.js";

// Import tool creators
import { createFileTools } from "../orchestrator/tools/file-tools.js";
import { createCodeTools } from "../orchestrator/tools/code-tools.js";
import { createResearchTools } from "../orchestrator/tools/research-tools.js";
import { createSystemTools } from "../orchestrator/tools/system-tools.js";

const logger = getLogger();

export interface AgentSpawnerConfig {
  maxParallel: number;
  defaultTimeout: number;
  maxIterations: number;
  model?: string;
  enableContextGuard?: boolean;
}

interface RunningAgent {
  id: string;
  type: AgentType;
  executor: AgentExecutor;
  stats: StatsTracker;
  abortController: AbortController;
  startTime: number;
}

const DEFAULT_CONFIG: AgentSpawnerConfig = {
  maxParallel: 4,
  defaultTimeout: 300000,
  maxIterations: 50,
  model: "k2.5",
  enableContextGuard: true,
};

export class AgentSpawner {
  private config: AgentSpawnerConfig;
  private _client?: KimiClient;
  private _providedClient?: KimiClient;
  private contextGuard?: ContextGuard;
  private activeAgents: Map<string, RunningAgent> = new Map();
  private queue: Array<{
    config: SubagentConfig;
    resolve: (result: SubagentResult) => void;
  }> = [];

  constructor(config?: Partial<AgentSpawnerConfig>, client?: KimiClient) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._providedClient = client;
    // Don't create client eagerly - wait until spawn() is called
  }

  /**
   * Get or create the KimiClient (lazy initialization)
   */
  private getClient(): KimiClient {
    if (this._providedClient) {
      return this._providedClient;
    }
    if (!this._client) {
      this._client = createKimiClient({ model: this.config.model });
      
      if (this.config.enableContextGuard) {
        this.contextGuard = createContextGuard(this._client, this.config.model || "k2.5");
      }
    }
    return this._client;
  }

  /**
   * Spawn an agent to execute a task
   */
  async spawn(config: SubagentConfig, parentSessionKey?: string): Promise<SubagentResult> {
    return new Promise((resolve) => {
      if (this.activeAgents.size >= this.config.maxParallel) {
        // Queue the task
        this.queue.push({ config, resolve });
        return;
      }

      this.executeAgent(config, parentSessionKey, resolve);
    });
  }

  /**
   * Execute an agent task
   */
  private async executeAgent(
    config: SubagentConfig,
    parentSessionKey: string | undefined,
    resolve: (result: SubagentResult) => void
  ): Promise<void> {
    const stats = createStatsTracker(this.config.model);
    const abortController = new AbortController();
    const agentType = config.type as AgentType;

    // Create session
    let sessionKey: string | undefined;
    if (parentSessionKey) {
      sessionKey = createChildKey(parentSessionKey, "agent") || undefined;
      if (sessionKey) {
        sessionRegistry.createSession(sessionKey, "agent", parentSessionKey, config.id, agentType);
      }
    }

    // Create executor
    const executor = createAgentExecutor(this.getClient(), {
      maxIterations: this.config.maxIterations,
      timeout: this.config.defaultTimeout,
      model: this.config.model,
    });

    // Register tools
    const tools = this.getToolsForAgent(agentType, config.workingDir);
    executor.registerTools(tools);

    // Track running agent
    const runningAgent: RunningAgent = {
      id: config.id,
      type: agentType,
      executor,
      stats,
      abortController,
      startTime: Date.now(),
    };
    this.activeAgents.set(config.id, runningAgent);

    try {
      // Build prompts
      const systemPrompt = buildSubagentSystemPrompt({
        taskId: config.id,
        parentSessionKey: parentSessionKey || "root",
        agentType,
        globalContext: this.extractContextByType(config.contextFiles, "global"),
        locationContext: this.extractContextByType(config.contextFiles, "location"),
        skillContext: this.extractContextByType(config.contextFiles, "skill"),
        ragContext: this.extractRagContext(config.contextFiles),
      });

      const userPrompt = buildUserPrompt(config.task);

      // Execute
      logger.info(`Starting agent ${config.id} (${agentType})`, { task: config.task.slice(0, 100) });

      const result = await executor.execute(systemPrompt, userPrompt, {
        onIteration: (iteration) => {
          stats.recordIteration();
        },
        onToolCall: (toolCall, output) => {
          stats.recordToolCall(toolCall.function.name);
          if (!output.success) {
            stats.recordError();
          }
        },
      });

      // Complete stats
      const finalStats = stats.complete();

      // Update session
      if (sessionKey) {
        if (result.success) {
          sessionRegistry.completeSession(sessionKey, {
            iterations: result.iterations,
            toolsUsed: result.toolsUsed,
            tokens: result.totalTokens,
            runtime: finalStats.runtime.endTime! - finalStats.runtime.startTime,
          });
        } else {
          sessionRegistry.failSession(sessionKey, result.error);
        }
      }

      // Announce result
      announceQueue.announceResult(
        config.id,
        sessionKey || "root",
        result.success,
        result.output,
        result.error,
        {
          runtime: finalStats.runtime.endTime! - finalStats.runtime.startTime,
          iterations: finalStats.runtime.iterations,
          tokensUsed: finalStats.tokens.totalTokens,
          toolsUsed: Array.from(finalStats.toolsUsed),
          estimatedCost: finalStats.cost?.totalCost,
        }
      );

      logger.info(`Agent ${config.id} completed`, {
        success: result.success,
        iterations: result.iterations,
        tools: result.toolsUsed.length,
      });

      resolve({
        subagentId: config.id,
        success: result.success,
        outputPath: undefined,
        output: result.output,
        error: result.error,
        metadata: {
          iterations: result.iterations,
          toolsUsed: result.toolsUsed,
          totalTokens: result.totalTokens,
          runtime: finalStats.runtime.endTime! - finalStats.runtime.startTime,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Agent ${config.id} failed`, { error: errorMessage });

      if (sessionKey) {
        sessionRegistry.failSession(sessionKey, errorMessage);
      }

      announceQueue.announceError(config.id, sessionKey || "root", errorMessage);

      resolve({
        subagentId: config.id,
        success: false,
        error: errorMessage,
      });
    } finally {
      this.activeAgents.delete(config.id);
      this.processQueue();
    }
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    while (this.activeAgents.size < this.config.maxParallel && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.executeAgent(next.config, undefined, next.resolve);
      }
    }
  }

  /**
   * Get tools for an agent type
   */
  private getToolsForAgent(agentType: AgentType, cwd?: string) {
    switch (agentType) {
      case "file":
        return createFileTools(cwd);
      case "code":
        return createCodeTools(cwd);
      case "research":
        return createResearchTools();
      case "system":
        return createSystemTools(cwd);
      default:
        return createCodeTools(cwd);
    }
  }

  /**
   * Extract context by type from context files
   */
  private extractContextByType(
    contextFiles: SubagentConfig["contextFiles"] | undefined,
    type: string
  ): string | undefined {
    if (!contextFiles) return undefined;
    const file = contextFiles.find((f) => f.path.includes(type));
    return file?.content;
  }

  /**
   * Extract RAG context from context files
   */
  private extractRagContext(
    contextFiles: SubagentConfig["contextFiles"] | undefined
  ): string[] | undefined {
    if (!contextFiles) return undefined;
    const ragFile = contextFiles.find((f) => f.path.includes("rag"));
    if (!ragFile) return undefined;
    return ragFile.content.split("\n\n").filter((s) => s.trim());
  }

  /**
   * Spawn multiple agents in parallel
   */
  async spawnMultiple(
    configs: SubagentConfig[],
    parentSessionKey?: string
  ): Promise<SubagentResult[]> {
    const promises = configs.map((config) => this.spawn(config, parentSessionKey));
    return Promise.all(promises);
  }

  /**
   * Spawn agents sequentially
   */
  async spawnSequential(
    configs: SubagentConfig[],
    parentSessionKey?: string
  ): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];
    for (const config of configs) {
      const result = await this.spawn(config, parentSessionKey);
      results.push(result);
    }
    return results;
  }

  /**
   * Terminate an agent
   */
  async terminate(agentId: string): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      agent.abortController.abort();
      this.activeAgents.delete(agentId);
    }
  }

  /**
   * Terminate all agents
   */
  async terminateAll(): Promise<void> {
    for (const [agentId] of this.activeAgents) {
      await this.terminate(agentId);
    }
    this.queue = [];
  }

  /**
   * Get active agent count
   */
  getActiveCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Get queued task count
   */
  getQueuedCount(): number {
    return this.queue.length;
  }

  /**
   * Get active agent IDs
   */
  getActiveAgentIds(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): { running: boolean; runtime?: number } {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return { running: false };
    }
    return {
      running: true,
      runtime: Date.now() - agent.startTime,
    };
  }
}

/**
 * Create an agent spawner
 */
export function createAgentSpawner(
  config?: Partial<AgentSpawnerConfig>,
  client?: KimiClient
): AgentSpawner {
  return new AgentSpawner(config, client);
}
