// Context Compaction System
// Token-aware message compaction and summarization for managing context window limits

import type { KimiMessage } from "../models/types.js";
import { KimiClient } from "../models/kimi.js";

export const BASE_CHUNK_RATIO = 0.4;
export const MIN_CHUNK_RATIO = 0.15;
export const SAFETY_MARGIN = 1.2; // 20% buffer for estimation inaccuracy
const DEFAULT_SUMMARY_FALLBACK = "No prior history.";
const DEFAULT_PARTS = 2;

// Token estimation (heuristic: ~4 chars per token on average)
const CHARS_PER_TOKEN = 4;

/**
 * Estimate tokens in a string
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens in a message
 */
export function estimateMessageTokens(message: KimiMessage): number {
  let tokens = 0;
  
  // Role overhead
  tokens += 4;
  
  // Content
  if (message.content) {
    tokens += estimateTokens(message.content);
  }
  
  // Tool calls
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      tokens += estimateTokens(tc.function.name);
      tokens += estimateTokens(tc.function.arguments);
      tokens += 10; // Overhead for structure
    }
  }
  
  // Tool call response
  if (message.tool_call_id) {
    tokens += 10;
  }
  
  return tokens;
}

/**
 * Estimate total tokens for a message array
 */
export function estimateMessagesTokens(messages: KimiMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * Normalize number of parts for splitting
 */
function normalizeParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) {
    return 1;
  }
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

/**
 * Split messages into roughly equal token-sized chunks
 */
export function splitMessagesByTokenShare(
  messages: KimiMessage[],
  parts = DEFAULT_PARTS
): KimiMessage[][] {
  if (messages.length === 0) {
    return [];
  }
  
  const normalizedParts = normalizeParts(parts, messages.length);
  if (normalizedParts <= 1) {
    return [messages];
  }

  const totalTokens = estimateMessagesTokens(messages);
  const targetTokens = totalTokens / normalizedParts;
  const chunks: KimiMessage[][] = [];
  let current: KimiMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message);
    if (
      chunks.length < normalizedParts - 1 &&
      current.length > 0 &&
      currentTokens + messageTokens > targetTokens
    ) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Chunk messages by maximum token count per chunk
 */
export function chunkMessagesByMaxTokens(
  messages: KimiMessage[],
  maxTokens: number
): KimiMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  const chunks: KimiMessage[][] = [];
  let currentChunk: KimiMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message);
    if (currentChunk.length > 0 && currentTokens + messageTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += messageTokens;

    // Split oversized messages to avoid unbounded chunk growth
    if (messageTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Compute adaptive chunk ratio based on average message size
 */
export function computeAdaptiveChunkRatio(
  messages: KimiMessage[],
  contextWindow: number
): number {
  if (messages.length === 0) {
    return BASE_CHUNK_RATIO;
  }

  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = totalTokens / messages.length;
  const safeAvgTokens = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvgTokens / contextWindow;

  // If average message is > 10% of context, reduce chunk ratio
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}

/**
 * Check if a single message is too large to summarize
 */
export function isOversizedForSummary(message: KimiMessage, contextWindow: number): boolean {
  const tokens = estimateMessageTokens(message) * SAFETY_MARGIN;
  return tokens > contextWindow * 0.5;
}

/**
 * Format messages as text for summarization
 */
export function formatMessagesForSummary(messages: KimiMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const content = msg.content || "";
      const toolCalls = msg.tool_calls
        ? `\n[Tool calls: ${msg.tool_calls.map((tc) => tc.function.name).join(", ")}]`
        : "";
      return `${role}: ${content}${toolCalls}`;
    })
    .join("\n\n");
}

/**
 * Summarize message chunks using the LLM
 */
async function summarizeChunks(params: {
  messages: KimiMessage[];
  client: KimiClient;
  signal?: AbortSignal;
  maxChunkTokens: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const chunks = chunkMessagesByMaxTokens(params.messages, params.maxChunkTokens);
  let summary = params.previousSummary;

  for (const chunk of chunks) {
    const formattedContent = formatMessagesForSummary(chunk);
    const systemPrompt = `You are a summarization assistant. Create a concise summary of the conversation that preserves:
- Key decisions made
- Important information discovered
- Outstanding tasks or questions
- Any constraints or requirements mentioned

${params.customInstructions ? `Additional focus:\n${params.customInstructions}` : ""}

${summary ? `Previous summary to incorporate:\n${summary}` : ""}`;

    const messages: KimiMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Summarize this conversation:\n\n${formattedContent}` },
    ];

    const response = await params.client.chat(messages, { temperature: 0.3 });
    summary = response.choices[0]?.message?.content ?? summary;
  }

  return summary ?? DEFAULT_SUMMARY_FALLBACK;
}

/**
 * Summarize with progressive fallback for handling oversized messages
 */
export async function summarizeWithFallback(params: {
  messages: KimiMessage[];
  client: KimiClient;
  signal?: AbortSignal;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  const { messages, contextWindow } = params;

  if (messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  // Try full summarization first
  try {
    return await summarizeChunks(params);
  } catch (fullError) {
    console.warn(
      `Full summarization failed, trying partial: ${
        fullError instanceof Error ? fullError.message : String(fullError)
      }`
    );
  }

  // Fallback 1: Summarize only small messages, note oversized ones
  const smallMessages: KimiMessage[] = [];
  const oversizedNotes: string[] = [];

  for (const msg of messages) {
    if (isOversizedForSummary(msg, contextWindow)) {
      const tokens = estimateMessageTokens(msg);
      oversizedNotes.push(
        `[Large ${msg.role} message (~${Math.round(tokens / 1000)}K tokens) omitted from summary]`
      );
    } else {
      smallMessages.push(msg);
    }
  }

  if (smallMessages.length > 0) {
    try {
      const partialSummary = await summarizeChunks({
        ...params,
        messages: smallMessages,
      });
      const notes = oversizedNotes.length > 0 ? `\n\n${oversizedNotes.join("\n")}` : "";
      return partialSummary + notes;
    } catch (partialError) {
      console.warn(
        `Partial summarization also failed: ${
          partialError instanceof Error ? partialError.message : String(partialError)
        }`
      );
    }
  }

  // Final fallback: Just note what was there
  return (
    `Context contained ${messages.length} messages (${oversizedNotes.length} oversized). ` +
    `Summary unavailable due to size limits.`
  );
}

/**
 * Summarize in multiple stages for very large histories
 */
export async function summarizeInStages(params: {
  messages: KimiMessage[];
  client: KimiClient;
  signal?: AbortSignal;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
  parts?: number;
  minMessagesForSplit?: number;
}): Promise<string> {
  const { messages } = params;
  if (messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const minMessagesForSplit = Math.max(2, params.minMessagesForSplit ?? 4);
  const parts = normalizeParts(params.parts ?? DEFAULT_PARTS, messages.length);
  const totalTokens = estimateMessagesTokens(messages);

  if (parts <= 1 || messages.length < minMessagesForSplit || totalTokens <= params.maxChunkTokens) {
    return summarizeWithFallback(params);
  }

  const splits = splitMessagesByTokenShare(messages, parts).filter((chunk) => chunk.length > 0);
  if (splits.length <= 1) {
    return summarizeWithFallback(params);
  }

  const partialSummaries: string[] = [];
  for (const chunk of splits) {
    partialSummaries.push(
      await summarizeWithFallback({
        ...params,
        messages: chunk,
        previousSummary: undefined,
      })
    );
  }

  if (partialSummaries.length === 1) {
    return partialSummaries[0];
  }

  // Merge partial summaries
  const summaryMessages: KimiMessage[] = partialSummaries.map((summary) => ({
    role: "user" as const,
    content: summary,
  }));

  const mergeInstructions = params.customInstructions
    ? `Merge these partial summaries into a single cohesive summary. Preserve decisions, TODOs, open questions, and any constraints.\n\nAdditional focus:\n${params.customInstructions}`
    : "Merge these partial summaries into a single cohesive summary. Preserve decisions, TODOs, open questions, and any constraints.";

  return summarizeWithFallback({
    ...params,
    messages: summaryMessages,
    customInstructions: mergeInstructions,
  });
}

/**
 * Prune history to fit within a context budget
 */
export function pruneHistoryForContextShare(params: {
  messages: KimiMessage[];
  maxContextTokens: number;
  maxHistoryShare?: number;
  parts?: number;
}): {
  messages: KimiMessage[];
  droppedMessages: KimiMessage[];
  droppedChunks: number;
  droppedMessageCount: number;
  droppedTokens: number;
  keptTokens: number;
  budgetTokens: number;
} {
  const maxHistoryShare = params.maxHistoryShare ?? 0.5;
  const budgetTokens = Math.max(1, Math.floor(params.maxContextTokens * maxHistoryShare));
  let keptMessages = params.messages;
  const allDroppedMessages: KimiMessage[] = [];
  let droppedChunks = 0;
  let droppedMessageCount = 0;
  let droppedTokens = 0;

  const parts = normalizeParts(params.parts ?? DEFAULT_PARTS, keptMessages.length);

  while (keptMessages.length > 0 && estimateMessagesTokens(keptMessages) > budgetTokens) {
    const chunks = splitMessagesByTokenShare(keptMessages, parts);
    if (chunks.length <= 1) {
      break;
    }
    const [dropped, ...rest] = chunks;
    droppedChunks += 1;
    droppedMessageCount += dropped.length;
    droppedTokens += estimateMessagesTokens(dropped);
    allDroppedMessages.push(...dropped);
    keptMessages = rest.flat();
  }

  return {
    messages: keptMessages,
    droppedMessages: allDroppedMessages,
    droppedChunks,
    droppedMessageCount,
    droppedTokens,
    keptTokens: estimateMessagesTokens(keptMessages),
    budgetTokens,
  };
}

/**
 * Compact messages by removing tool call details from old messages
 */
export function compactToolCalls(
  messages: KimiMessage[],
  keepRecentCount: number = 5
): KimiMessage[] {
  if (messages.length <= keepRecentCount) {
    return messages;
  }

  const cutoff = messages.length - keepRecentCount;
  
  return messages.map((msg, index) => {
    if (index >= cutoff || !msg.tool_calls) {
      return msg;
    }

    // Compact old tool calls to just their names
    const toolNames = msg.tool_calls.map((tc) => tc.function.name).join(", ");
    return {
      ...msg,
      content: msg.content 
        ? `${msg.content}\n[Called tools: ${toolNames}]`
        : `[Called tools: ${toolNames}]`,
      tool_calls: undefined,
    };
  });
}

/**
 * Create a compact summary message for insertion at the start of context
 */
export function createSummaryMessage(summary: string): KimiMessage {
  return {
    role: "system",
    content: `## Previous Conversation Summary\n\n${summary}\n\n---\n\nContinue from where the conversation left off.`,
  };
}
