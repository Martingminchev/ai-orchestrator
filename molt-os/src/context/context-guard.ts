// Context Guard
// Automatically manages context window usage and triggers compaction when needed

import type { KimiMessage, ModelInfo } from "../models/types.js";
import { getModelInfo } from "../models/types.js";
import { KimiClient } from "../models/kimi.js";
import {
  estimateMessagesTokens,
  estimateMessageTokens,
  pruneHistoryForContextShare,
  summarizeInStages,
  createSummaryMessage,
  compactToolCalls,
} from "./compaction.js";

export interface ContextGuardConfig {
  /** Threshold ratio at which compaction triggers (default: 0.85) */
  compactionThreshold: number;
  /** Target ratio after compaction (default: 0.5) */
  targetRatio: number;
  /** Reserved tokens for system prompt and response (default: 4096) */
  reservedTokens: number;
  /** Keep this many recent messages uncompacted (default: 10) */
  keepRecentMessages: number;
  /** Maximum chunk size for summarization (default: 8192) */
  maxChunkTokens: number;
  /** Enable auto-compaction (default: true) */
  autoCompact: boolean;
}

export interface ContextGuardStats {
  currentTokens: number;
  maxTokens: number;
  usageRatio: number;
  compactionCount: number;
  lastCompactionAt: number | null;
  summaryLength: number;
}

export interface ContextGuardResult {
  messages: KimiMessage[];
  compacted: boolean;
  stats: ContextGuardStats;
}

const DEFAULT_CONFIG: ContextGuardConfig = {
  compactionThreshold: 0.85,
  targetRatio: 0.5,
  reservedTokens: 4096,
  keepRecentMessages: 10,
  maxChunkTokens: 8192,
  autoCompact: true,
};

export class ContextGuard {
  private config: ContextGuardConfig;
  private modelInfo: ModelInfo;
  private client: KimiClient;
  private summary: string = "";
  private compactionCount: number = 0;
  private lastCompactionAt: number | null = null;

  constructor(
    client: KimiClient,
    modelId: string,
    config?: Partial<ContextGuardConfig>
  ) {
    this.client = client;
    this.modelInfo = getModelInfo(modelId);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the effective context window (minus reserved tokens)
   */
  get effectiveContextWindow(): number {
    return Math.max(1, this.modelInfo.contextWindow - this.config.reservedTokens);
  }

  /**
   * Get current statistics
   */
  getStats(messages: KimiMessage[]): ContextGuardStats {
    const currentTokens = estimateMessagesTokens(messages);
    return {
      currentTokens,
      maxTokens: this.effectiveContextWindow,
      usageRatio: currentTokens / this.effectiveContextWindow,
      compactionCount: this.compactionCount,
      lastCompactionAt: this.lastCompactionAt,
      summaryLength: this.summary.length,
    };
  }

  /**
   * Check if compaction is needed
   */
  needsCompaction(messages: KimiMessage[]): boolean {
    const stats = this.getStats(messages);
    return stats.usageRatio >= this.config.compactionThreshold;
  }

  /**
   * Check if a message can be added without exceeding limits
   */
  canAddMessage(messages: KimiMessage[], newMessage: KimiMessage): boolean {
    const currentTokens = estimateMessagesTokens(messages);
    const newTokens = estimateMessageTokens(newMessage);
    return currentTokens + newTokens <= this.effectiveContextWindow;
  }

  /**
   * Process messages, compacting if necessary
   */
  async process(
    messages: KimiMessage[],
    customInstructions?: string
  ): Promise<ContextGuardResult> {
    const stats = this.getStats(messages);

    if (!this.needsCompaction(messages)) {
      return {
        messages,
        compacted: false,
        stats,
      };
    }

    if (!this.config.autoCompact) {
      return {
        messages,
        compacted: false,
        stats,
      };
    }

    const compactedMessages = await this.compact(messages, customInstructions);
    const newStats = this.getStats(compactedMessages);

    return {
      messages: compactedMessages,
      compacted: true,
      stats: newStats,
    };
  }

  /**
   * Compact messages to fit within target ratio
   */
  async compact(
    messages: KimiMessage[],
    customInstructions?: string
  ): Promise<KimiMessage[]> {
    const targetTokens = Math.floor(this.effectiveContextWindow * this.config.targetRatio);
    
    // Step 1: Separate system messages and conversation
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    // Step 2: Keep recent messages untouched
    const keepCount = Math.min(this.config.keepRecentMessages, conversationMessages.length);
    const recentMessages = conversationMessages.slice(-keepCount);
    const olderMessages = conversationMessages.slice(0, -keepCount);

    if (olderMessages.length === 0) {
      // Nothing to compact
      return messages;
    }

    // Step 3: Compact tool calls in older messages
    const compactedOlder = compactToolCalls(olderMessages, 0);

    // Step 4: Summarize older messages
    const summary = await summarizeInStages({
      messages: compactedOlder,
      client: this.client,
      maxChunkTokens: this.config.maxChunkTokens,
      contextWindow: this.effectiveContextWindow,
      customInstructions,
      previousSummary: this.summary,
    });

    this.summary = summary;
    this.compactionCount++;
    this.lastCompactionAt = Date.now();

    // Step 5: Create summary message
    const summaryMessage = createSummaryMessage(summary);

    // Step 6: Check if we fit in budget
    const resultMessages = [...systemMessages, summaryMessage, ...recentMessages];
    const resultTokens = estimateMessagesTokens(resultMessages);

    if (resultTokens <= targetTokens) {
      return resultMessages;
    }

    // Step 7: If still too large, prune recent messages
    const pruned = pruneHistoryForContextShare({
      messages: recentMessages,
      maxContextTokens: targetTokens - estimateMessagesTokens([...systemMessages, summaryMessage]),
      maxHistoryShare: 1.0,
    });

    return [...systemMessages, summaryMessage, ...pruned.messages];
  }

  /**
   * Force compaction regardless of current usage
   */
  async forceCompact(
    messages: KimiMessage[],
    customInstructions?: string
  ): Promise<ContextGuardResult> {
    const compactedMessages = await this.compact(messages, customInstructions);
    const stats = this.getStats(compactedMessages);

    return {
      messages: compactedMessages,
      compacted: true,
      stats,
    };
  }

  /**
   * Get the current summary
   */
  getSummary(): string {
    return this.summary;
  }

  /**
   * Set a custom summary (e.g., from a previous session)
   */
  setSummary(summary: string): void {
    this.summary = summary;
  }

  /**
   * Reset the guard state
   */
  reset(): void {
    this.summary = "";
    this.compactionCount = 0;
    this.lastCompactionAt = null;
  }

  /**
   * Create messages with summary prepended if available
   */
  createContextWithSummary(
    systemMessages: KimiMessage[],
    conversationMessages: KimiMessage[]
  ): KimiMessage[] {
    if (!this.summary) {
      return [...systemMessages, ...conversationMessages];
    }

    const summaryMessage = createSummaryMessage(this.summary);
    return [...systemMessages, summaryMessage, ...conversationMessages];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextGuardConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextGuardConfig {
    return { ...this.config };
  }
}

/**
 * Create a context guard with default settings
 */
export function createContextGuard(
  client: KimiClient,
  modelId: string,
  config?: Partial<ContextGuardConfig>
): ContextGuard {
  return new ContextGuard(client, modelId, config);
}
