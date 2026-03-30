// Task Execution Engine
// Replaces the simulated execution with real LLM-based agent execution

import type { Task, TaskResult } from "./orchestrator.js";
import type { AgentType, AgentResult } from "../agents/types.js";
import { AgentExecutor, createAgentExecutor, ExecutorResult } from "../agents/executor.js";
import { KimiClient, createKimiClient } from "../models/kimi.js";
import { AgentFactory, createAgentFactory } from "../agents/factory.js";
import { sessionRegistry, buildOrchestratorKey, createChildKey } from "../session/index.js";
import { ContextGuard, createContextGuard } from "../context/context-guard.js";
import { getLogger } from "../utils/logger.js";

// Tool executors for different agent types
import { createFileTools } from "./tools/file-tools.js";
import { createCodeTools } from "./tools/code-tools.js";
import { createResearchTools } from "./tools/research-tools.js";
import { createSystemTools } from "./tools/system-tools.js";

export interface TaskExecutionConfig {
  model?: string;
  maxIterations?: number;
  timeout?: number;
  enableContextGuard?: boolean;
}

export interface TaskExecutionContext {
  sessionKey: string;
  workerId: string;
  client: KimiClient;
  contextGuard?: ContextGuard;
}

const logger = getLogger();

/**
 * Determine the best agent type for a task based on its prompt
 */
export function determineAgentType(task: Task): AgentType {
  const prompt = task.prompt.toLowerCase();

  // File operations
  if (
    prompt.includes("read file") ||
    prompt.includes("write file") ||
    prompt.includes("create file") ||
    prompt.includes("delete file") ||
    prompt.includes("move file") ||
    prompt.includes("copy file") ||
    prompt.includes("list directory") ||
    prompt.includes("list files") ||
    prompt.includes("list all") ||
    prompt.includes("find files") ||
    prompt.includes("glob") ||
    prompt.includes("files in")
  ) {
    return "file";
  }

  // Code operations
  if (
    prompt.includes("code") ||
    prompt.includes("function") ||
    prompt.includes("class") ||
    prompt.includes("refactor") ||
    prompt.includes("implement") ||
    prompt.includes("fix bug") ||
    prompt.includes("add feature") ||
    prompt.includes("write test") ||
    prompt.includes("analyze code")
  ) {
    return "code";
  }

  // Research operations
  if (
    prompt.includes("research") ||
    prompt.includes("find information") ||
    prompt.includes("search for") ||
    prompt.includes("look up") ||
    prompt.includes("gather data") ||
    prompt.includes("investigate")
  ) {
    return "research";
  }

  // System operations
  if (
    prompt.includes("run command") ||
    prompt.includes("execute") ||
    prompt.includes("shell") ||
    prompt.includes("terminal") ||
    prompt.includes("process") ||
    prompt.includes("system")
  ) {
    return "system";
  }

  // Default to code agent for general tasks
  return "code";
}

/**
 * Create tools for an agent type
 */
export function createToolsForAgent(agentType: AgentType, cwd?: string) {
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
 * Create a system prompt for an agent type
 */
export function createAgentSystemPrompt(agentType: AgentType, task: Task): string {
  const cwd = task.context?.cwd || process.cwd();
  
  const basePrompt = `You are a specialized ${agentType} agent in the MOLT-OS orchestration system.
Your task is to complete the assigned work efficiently and accurately.

## CRITICAL: You MUST Take Action
You are an EXECUTION agent, not an advisory assistant. You MUST:
1. Actually CREATE files using the write_code or write_file tools
2. Actually READ files using the read_code or read_file tools  
3. Actually EXECUTE operations - don't just describe what you would do

DO NOT just explain or provide code samples in your response.
DO NOT say "you can do this" or "here's how to do this".
ACTUALLY DO IT by calling the tools.

## Working Directory
Your current working directory is: ${cwd}
All relative paths will be resolved from this directory.

## Guidelines
- ALWAYS use tools to accomplish the task - never just describe
- For multi-step tasks, execute each step using tools
- Report what you actually did, not what could be done
- If you cannot complete something, explain why

## Task Context
${task.context ? JSON.stringify(task.context, null, 2) : "No additional context provided."}
`;

  switch (agentType) {
    case "file":
      return `${basePrompt}

## File Agent Capabilities
- Read files with various encodings
- Write files with automatic directory creation
- Move and rename files safely
- Delete files with confirmation
- List directory contents
- Search files using glob patterns
- Copy files preserving structure`;

    case "code":
      return `${basePrompt}

## Code Agent Capabilities
- Analyze and understand code
- Write new functions and classes
- Refactor existing code
- Fix bugs and issues
- Add features to existing code
- Write tests
- Generate documentation`;

    case "research":
      return `${basePrompt}

## Research Agent Capabilities
- Search for information
- Analyze data
- Summarize findings
- Compare options
- Provide recommendations`;

    case "system":
      return `${basePrompt}

## System Agent Capabilities
- Execute shell commands
- Manage processes
- Check system status
- Run scripts
- Monitor resources`;

    default:
      return basePrompt;
  }
}

/**
 * Execute a task using the real LLM agent system
 */
export async function executeTask(
  task: Task,
  context: TaskExecutionContext,
  config?: TaskExecutionConfig
): Promise<TaskResult> {
  const startTime = Date.now();
  const agentType = determineAgentType(task);

  logger.info(`Executing task ${task.id} with ${agentType} agent`);

  // Create agent session
  const agentSessionKey = createChildKey(context.sessionKey, "agent");
  if (agentSessionKey) {
    sessionRegistry.createSession(agentSessionKey, "agent", context.sessionKey, task.id, agentType);
  }

  try {
    // Create executor
    const executor = createAgentExecutor(context.client, {
      maxIterations: config?.maxIterations ?? 50,
      timeout: config?.timeout ?? 300000,
      model: config?.model,
    });

    // Register tools
    const tools = createToolsForAgent(agentType, task.context?.cwd as string | undefined);
    executor.registerTools(tools);

    // Create prompts
    const systemPrompt = createAgentSystemPrompt(agentType, task);
    const userPrompt = task.prompt;

    // Execute
    const result = await executor.execute(systemPrompt, userPrompt, {
      onIteration: (iteration, message) => {
        logger.debug(`Task ${task.id} iteration ${iteration}`, { 
          hasToolCalls: !!message.tool_calls?.length 
        });
      },
      onToolCall: (toolCall, output) => {
        logger.debug(`Task ${task.id} tool call: ${toolCall.function.name}`, {
          success: output.success,
        });
      },
    });

    // Mark session complete
    if (agentSessionKey) {
      if (result.success) {
        sessionRegistry.completeSession(agentSessionKey, {
          iterations: result.iterations,
          toolsUsed: result.toolsUsed,
          tokens: result.totalTokens,
        });
      } else {
        sessionRegistry.failSession(agentSessionKey, result.error);
      }
    }

    const duration = Date.now() - startTime;

    return {
      taskId: task.id,
      success: result.success,
      result: {
        output: result.output,
        iterations: result.iterations,
        toolsUsed: result.toolsUsed,
        totalTokens: result.totalTokens,
        agentType,
        duration,
      },
      error: result.error,
      completedAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (agentSessionKey) {
      sessionRegistry.failSession(agentSessionKey, errorMessage);
    }

    logger.error(`Task ${task.id} execution failed`, { error: errorMessage });

    return {
      taskId: task.id,
      success: false,
      error: errorMessage,
      completedAt: new Date(),
    };
  }
}

/**
 * Task Execution Engine - manages the execution of tasks through agents
 */
export class TaskExecutionEngine {
  private client: KimiClient;
  private config: TaskExecutionConfig;
  private agentFactory: AgentFactory;
  private sessionKey: string;
  private contextGuard?: ContextGuard;

  constructor(client: KimiClient, sessionKey: string, config?: TaskExecutionConfig) {
    this.client = client;
    this.config = config ?? {};
    this.agentFactory = createAgentFactory({
      defaultTimeout: config?.timeout ?? 300000,
      maxIterations: config?.maxIterations ?? 50,
    });
    this.sessionKey = sessionKey;

    if (config?.enableContextGuard !== false) {
      this.contextGuard = createContextGuard(client, config?.model ?? "k2.5");
    }
  }

  /**
   * Execute a single task
   */
  async execute(task: Task): Promise<TaskResult> {
    // Create a worker session for this task
    const workerKey = createChildKey(this.sessionKey, "worker");
    if (workerKey) {
      sessionRegistry.createSession(workerKey, "worker", this.sessionKey, task.id);
    }

    const context: TaskExecutionContext = {
      sessionKey: workerKey || this.sessionKey,
      workerId: workerKey?.split(":").pop() || "unknown",
      client: this.client,
      contextGuard: this.contextGuard,
    };

    try {
      const result = await executeTask(task, context, this.config);

      if (workerKey) {
        if (result.success) {
          sessionRegistry.completeSession(workerKey);
        } else {
          sessionRegistry.failSession(workerKey, result.error);
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (workerKey) {
        sessionRegistry.failSession(workerKey, errorMessage);
      }

      return {
        taskId: task.id,
        success: false,
        error: errorMessage,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeParallel(tasks: Task[], maxConcurrent: number = 5): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const promise = this.execute(task).then((result) => {
        results.push(result);
      });

      executing.push(promise);

      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          const p = executing[i];
          // Check if promise is settled
          await Promise.race([p, Promise.resolve("pending")]).then((v) => {
            if (v !== "pending") {
              executing.splice(i, 1);
            }
          });
        }
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Get the session key for this engine
   */
  getSessionKey(): string {
    return this.sessionKey;
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return sessionRegistry.getStats();
  }
}

/**
 * Create a task execution engine
 */
export function createTaskExecutionEngine(
  apiKey?: string,
  config?: TaskExecutionConfig
): TaskExecutionEngine {
  const client = createKimiClient({ apiKey, model: config?.model });
  const sessionKey = buildOrchestratorKey();
  sessionRegistry.createSession(sessionKey, "orchestrator", null);

  return new TaskExecutionEngine(client, sessionKey, config);
}
