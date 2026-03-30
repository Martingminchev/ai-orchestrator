// Announce Queue Types
// Types for the subagent announcement system

export type AnnounceMode = 
  | "immediate"  // Send result immediately
  | "steer"      // Wait for guidance before continuing
  | "followup"   // Queue for followup processing
  | "collect"    // Collect and batch results
  | "interrupt"; // Interrupt current flow with urgent result

export interface AnnounceItem {
  id: string;
  subagentId: string;
  sessionKey: string;
  mode: AnnounceMode;
  result: SubagentAnnouncement;
  priority: number;
  createdAt: number;
  processedAt?: number;
  status: AnnounceStatus;
}

export type AnnounceStatus = "pending" | "processing" | "delivered" | "failed";

export interface SubagentAnnouncement {
  type: "result" | "progress" | "error" | "request";
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  stats?: AnnounceStats;
}

export interface AnnounceStats {
  runtime: number;
  iterations: number;
  tokensUsed: number;
  toolsUsed: string[];
  estimatedCost?: number;
}

export interface AnnounceQueueConfig {
  maxQueueSize: number;
  processingInterval: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface AnnounceHandler {
  (item: AnnounceItem): Promise<void>;
}

export interface CollectorResult {
  items: AnnounceItem[];
  summary: string;
  totalRuntime: number;
  totalTokens: number;
  successCount: number;
  failureCount: number;
}
