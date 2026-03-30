// Session Key Hierarchy Types
// Hierarchical session keys for tracking parent-child relationships across the 4-layer architecture

export type SessionLayer = "orchestrator" | "worker" | "planner" | "agent";

export interface SessionKeyParts {
  orchestratorId: string;
  workerId?: string;
  plannerId?: string;
  agentId?: string;
}

export interface SessionKeyInfo extends SessionKeyParts {
  layer: SessionLayer;
  fullKey: string;
  parentKey: string | null;
  depth: number;
}

export interface SessionMetadata {
  key: string;
  layer: SessionLayer;
  parentKey: string | null;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  taskId?: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
}

export type SessionStatus = "active" | "completed" | "failed" | "cancelled" | "timeout";

export interface SessionTreeNode {
  key: string;
  layer: SessionLayer;
  status: SessionStatus;
  children: SessionTreeNode[];
  metadata?: Record<string, unknown>;
}

export interface SessionRegistryEntry {
  session: SessionMetadata;
  children: Set<string>;
}

export interface SessionRegistryStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  byLayer: Record<SessionLayer, number>;
}

// Events
export type SessionEventType = 
  | "session:created"
  | "session:updated"
  | "session:completed"
  | "session:failed"
  | "session:cancelled";

export interface SessionEvent {
  type: SessionEventType;
  sessionKey: string;
  layer: SessionLayer;
  parentKey: string | null;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
