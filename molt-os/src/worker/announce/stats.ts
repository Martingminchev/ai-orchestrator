// Announce Stats Tracking
// Track runtime, tokens, and cost for subagent executions

export interface RuntimeStats {
  startTime: number;
  endTime?: number;
  pausedDuration: number;
  iterations: number;
}

export interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export interface ExecutionStats {
  runtime: RuntimeStats;
  tokens: TokenStats;
  cost?: CostEstimate;
  toolsUsed: Set<string>;
  toolCallCount: number;
  errorCount: number;
}

// Cost per 1M tokens for different models
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "k2.5": { input: 0.01, output: 0.02 },
  "moonshot-v1-8k": { input: 0.012, output: 0.012 },
  "moonshot-v1-32k": { input: 0.024, output: 0.024 },
  "moonshot-v1-128k": { input: 0.06, output: 0.06 },
};

export class StatsTracker {
  private stats: ExecutionStats;
  private model: string;
  private pauseStart?: number;

  constructor(model: string = "k2.5") {
    this.model = model;
    this.stats = {
      runtime: {
        startTime: Date.now(),
        pausedDuration: 0,
        iterations: 0,
      },
      tokens: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      toolsUsed: new Set(),
      toolCallCount: 0,
      errorCount: 0,
    };
  }

  /**
   * Record an iteration
   */
  recordIteration(): void {
    this.stats.runtime.iterations++;
  }

  /**
   * Record token usage
   */
  recordTokens(prompt: number, completion: number): void {
    this.stats.tokens.promptTokens += prompt;
    this.stats.tokens.completionTokens += completion;
    this.stats.tokens.totalTokens += prompt + completion;
  }

  /**
   * Record a tool call
   */
  recordToolCall(toolName: string): void {
    this.stats.toolsUsed.add(toolName);
    this.stats.toolCallCount++;
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.stats.errorCount++;
  }

  /**
   * Pause timing (e.g., during user input)
   */
  pause(): void {
    if (!this.pauseStart) {
      this.pauseStart = Date.now();
    }
  }

  /**
   * Resume timing
   */
  resume(): void {
    if (this.pauseStart) {
      this.stats.runtime.pausedDuration += Date.now() - this.pauseStart;
      this.pauseStart = undefined;
    }
  }

  /**
   * Complete the execution
   */
  complete(): ExecutionStats {
    this.resume(); // Ensure any pause is ended
    this.stats.runtime.endTime = Date.now();
    this.stats.cost = this.calculateCost();
    return this.stats;
  }

  /**
   * Calculate estimated cost
   */
  private calculateCost(): CostEstimate {
    const pricing = MODEL_PRICING[this.model] || MODEL_PRICING["k2.5"];
    
    const inputCost = (this.stats.tokens.promptTokens / 1_000_000) * pricing.input;
    const outputCost = (this.stats.tokens.completionTokens / 1_000_000) * pricing.output;

    return {
      inputCost: Math.round(inputCost * 10000) / 10000,
      outputCost: Math.round(outputCost * 10000) / 10000,
      totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
      currency: "USD",
    };
  }

  /**
   * Get current elapsed time in milliseconds
   */
  getElapsedTime(): number {
    const endTime = this.stats.runtime.endTime || Date.now();
    const currentPause = this.pauseStart ? Date.now() - this.pauseStart : 0;
    return endTime - this.stats.runtime.startTime - this.stats.runtime.pausedDuration - currentPause;
  }

  /**
   * Get a summary of the stats
   */
  getSummary(): {
    runtime: number;
    iterations: number;
    tokensUsed: number;
    toolsUsed: string[];
    estimatedCost: number;
  } {
    return {
      runtime: this.getElapsedTime(),
      iterations: this.stats.runtime.iterations,
      tokensUsed: this.stats.tokens.totalTokens,
      toolsUsed: Array.from(this.stats.toolsUsed),
      estimatedCost: this.stats.cost?.totalCost || 0,
    };
  }

  /**
   * Get formatted runtime string
   */
  getFormattedRuntime(): string {
    const elapsed = this.getElapsedTime();
    
    if (elapsed < 1000) {
      return `${elapsed}ms`;
    } else if (elapsed < 60000) {
      return `${(elapsed / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Get the full stats object
   */
  getStats(): ExecutionStats {
    return this.stats;
  }
}

/**
 * Create a stats tracker for an execution
 */
export function createStatsTracker(model?: string): StatsTracker {
  return new StatsTracker(model);
}

/**
 * Format stats for display
 */
export function formatStats(stats: ExecutionStats): string {
  const runtime = stats.runtime.endTime 
    ? stats.runtime.endTime - stats.runtime.startTime - stats.runtime.pausedDuration
    : 0;

  const lines = [
    `Runtime: ${formatDuration(runtime)}`,
    `Iterations: ${stats.runtime.iterations}`,
    `Tokens: ${stats.tokens.totalTokens.toLocaleString()} (${stats.tokens.promptTokens.toLocaleString()} in, ${stats.tokens.completionTokens.toLocaleString()} out)`,
    `Tool calls: ${stats.toolCallCount} (${Array.from(stats.toolsUsed).join(", ") || "none"})`,
  ];

  if (stats.cost) {
    lines.push(`Estimated cost: $${stats.cost.totalCost.toFixed(4)}`);
  }

  if (stats.errorCount > 0) {
    lines.push(`Errors: ${stats.errorCount}`);
  }

  return lines.join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
