// Announce Queue
// Manages the flow of subagent results back to the worker/orchestrator

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import type {
  AnnounceItem,
  AnnounceMode,
  AnnounceStatus,
  AnnounceQueueConfig,
  AnnounceHandler,
  SubagentAnnouncement,
  CollectorResult,
  AnnounceStats,
} from "./types.js";

const DEFAULT_CONFIG: AnnounceQueueConfig = {
  maxQueueSize: 1000,
  processingInterval: 100,
  batchSize: 10,
  retryAttempts: 3,
  retryDelay: 1000,
};

export class AnnounceQueue extends EventEmitter {
  private config: AnnounceQueueConfig;
  private queue: AnnounceItem[] = [];
  private handlers: Map<AnnounceMode, AnnounceHandler[]> = new Map();
  private collectors: Map<string, AnnounceItem[]> = new Map();
  private processing: boolean = false;
  private processingTimer?: NodeJS.Timeout;

  constructor(config?: Partial<AnnounceQueueConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add an announcement to the queue
   */
  announce(
    subagentId: string,
    sessionKey: string,
    mode: AnnounceMode,
    result: SubagentAnnouncement,
    priority: number = 0
  ): string {
    const item: AnnounceItem = {
      id: randomUUID(),
      subagentId,
      sessionKey,
      mode,
      result,
      priority,
      createdAt: Date.now(),
      status: "pending",
    };

    if (mode === "immediate" || mode === "interrupt") {
      // Process immediately
      this.processItem(item);
    } else if (mode === "collect") {
      // Add to collector
      this.addToCollector(sessionKey, item);
    } else {
      // Add to queue
      this.addToQueue(item);
    }

    this.emit("announced", item);
    return item.id;
  }

  /**
   * Add an item to the queue with priority sorting
   */
  private addToQueue(item: AnnounceItem): void {
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove lowest priority item
      this.queue.sort((a, b) => b.priority - a.priority);
      const removed = this.queue.pop();
      if (removed) {
        this.emit("dropped", removed);
      }
    }

    // Insert at correct position based on priority
    const insertIndex = this.queue.findIndex((q) => q.priority < item.priority);
    if (insertIndex === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(insertIndex, 0, item);
    }

    this.startProcessing();
  }

  /**
   * Add to collector for batch processing
   */
  private addToCollector(sessionKey: string, item: AnnounceItem): void {
    if (!this.collectors.has(sessionKey)) {
      this.collectors.set(sessionKey, []);
    }
    this.collectors.get(sessionKey)!.push(item);
    item.status = "processing";
  }

  /**
   * Collect all results for a session
   */
  collect(sessionKey: string): CollectorResult {
    const items = this.collectors.get(sessionKey) || [];
    this.collectors.delete(sessionKey);

    let totalRuntime = 0;
    let totalTokens = 0;
    let successCount = 0;
    let failureCount = 0;
    const summaryParts: string[] = [];

    for (const item of items) {
      item.status = "delivered";
      item.processedAt = Date.now();

      if (item.result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      if (item.result.stats) {
        totalRuntime += item.result.stats.runtime;
        totalTokens += item.result.stats.tokensUsed;
      }

      if (item.result.output) {
        summaryParts.push(`[${item.subagentId}]: ${item.result.output.slice(0, 100)}...`);
      }
    }

    return {
      items,
      summary: summaryParts.join("\n"),
      totalRuntime,
      totalTokens,
      successCount,
      failureCount,
    };
  }

  /**
   * Register a handler for a specific mode
   */
  onMode(mode: AnnounceMode, handler: AnnounceHandler): void {
    if (!this.handlers.has(mode)) {
      this.handlers.set(mode, []);
    }
    this.handlers.get(mode)!.push(handler);
  }

  /**
   * Remove a handler
   */
  offMode(mode: AnnounceMode, handler: AnnounceHandler): void {
    const handlers = this.handlers.get(mode);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Start processing queue
   */
  private startProcessing(): void {
    if (this.processing || this.processingTimer) {
      return;
    }

    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, this.config.processingInterval);
  }

  /**
   * Stop processing queue
   */
  stopProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
    this.processing = false;
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const batch = this.queue.splice(0, this.config.batchSize);

      for (const item of batch) {
        await this.processItem(item);
      }
    } finally {
      this.processing = false;

      if (this.queue.length === 0) {
        this.stopProcessing();
      }
    }
  }

  /**
   * Process a single item
   */
  private async processItem(item: AnnounceItem): Promise<void> {
    item.status = "processing";

    try {
      const handlers = this.handlers.get(item.mode) || [];

      for (const handler of handlers) {
        await handler(item);
      }

      item.status = "delivered";
      item.processedAt = Date.now();
      this.emit("delivered", item);
    } catch (error) {
      item.status = "failed";
      this.emit("failed", item, error);
    }
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    processing: boolean;
    collectors: number;
  } {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      collectors: this.collectors.size,
    };
  }

  /**
   * Get pending items for a session
   */
  getPending(sessionKey: string): AnnounceItem[] {
    return this.queue.filter((item) => item.sessionKey === sessionKey);
  }

  /**
   * Cancel all pending items for a session
   */
  cancel(sessionKey: string): number {
    const before = this.queue.length;
    this.queue = this.queue.filter((item) => item.sessionKey !== sessionKey);
    this.collectors.delete(sessionKey);
    return before - this.queue.length;
  }

  /**
   * Clear the entire queue
   */
  clear(): void {
    this.queue = [];
    this.collectors.clear();
    this.stopProcessing();
  }

  /**
   * Create a convenience method for announcing results
   */
  announceResult(
    subagentId: string,
    sessionKey: string,
    success: boolean,
    output?: string,
    error?: string,
    stats?: AnnounceStats
  ): string {
    return this.announce(subagentId, sessionKey, "immediate", {
      type: "result",
      success,
      output,
      error,
      stats,
    });
  }

  /**
   * Create a convenience method for announcing progress
   */
  announceProgress(
    subagentId: string,
    sessionKey: string,
    output: string,
    stats?: Partial<AnnounceStats>
  ): string {
    return this.announce(subagentId, sessionKey, "followup", {
      type: "progress",
      success: true,
      output,
      stats: stats as AnnounceStats,
    });
  }

  /**
   * Create a convenience method for announcing errors
   */
  announceError(
    subagentId: string,
    sessionKey: string,
    error: string,
    stats?: AnnounceStats
  ): string {
    return this.announce(subagentId, sessionKey, "immediate", {
      type: "error",
      success: false,
      error,
      stats,
    }, 10); // High priority for errors
  }
}

// Global announce queue instance
export const announceQueue = new AnnounceQueue();
