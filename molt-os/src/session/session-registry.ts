// Session Registry
// Track parent-child relationships and session lifecycle

import { EventEmitter } from "events";
import type {
  SessionMetadata,
  SessionStatus,
  SessionLayer,
  SessionTreeNode,
  SessionRegistryEntry,
  SessionRegistryStats,
  SessionEvent,
  SessionEventType,
} from "./types.js";
import {
  parseSessionKey,
  getParentKey,
  getAncestorKeys,
  createChildKey,
  buildOrchestratorKey,
  generateSessionId,
} from "./session-key-utils.js";

export class SessionRegistry extends EventEmitter {
  private sessions: Map<string, SessionRegistryEntry> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new orchestrator session
   */
  createOrchestratorSession(taskId?: string, metadata?: Record<string, unknown>): SessionMetadata {
    const key = buildOrchestratorKey();
    return this.createSession(key, "orchestrator", null, taskId, undefined, metadata);
  }

  /**
   * Create a child session under an existing parent
   */
  createChildSession(
    parentKey: string,
    childLayer: SessionLayer,
    taskId?: string,
    agentType?: string,
    metadata?: Record<string, unknown>
  ): SessionMetadata | null {
    const childKey = createChildKey(parentKey, childLayer);
    if (!childKey) {
      return null;
    }

    const session = this.createSession(childKey, childLayer, parentKey, taskId, agentType, metadata);
    
    // Register child with parent
    const parentEntry = this.sessions.get(parentKey);
    if (parentEntry) {
      parentEntry.children.add(childKey);
    }

    return session;
  }

  /**
   * Create a session with full control over parameters
   */
  createSession(
    key: string,
    layer: SessionLayer,
    parentKey: string | null,
    taskId?: string,
    agentType?: string,
    metadata?: Record<string, unknown>
  ): SessionMetadata {
    const now = Date.now();
    
    const session: SessionMetadata = {
      key,
      layer,
      parentKey,
      createdAt: now,
      updatedAt: now,
      status: "active",
      taskId,
      agentType,
      metadata,
    };

    const entry: SessionRegistryEntry = {
      session,
      children: new Set(),
    };

    this.sessions.set(key, entry);
    this.emitEvent("session:created", session);

    return session;
  }

  /**
   * Get a session by key
   */
  getSession(key: string): SessionMetadata | null {
    return this.sessions.get(key)?.session ?? null;
  }

  /**
   * Update session status
   */
  updateStatus(key: string, status: SessionStatus): boolean {
    const entry = this.sessions.get(key);
    if (!entry) {
      return false;
    }

    entry.session.status = status;
    entry.session.updatedAt = Date.now();

    const eventType = this.getEventTypeForStatus(status);
    if (eventType) {
      this.emitEvent(eventType, entry.session);
    }

    return true;
  }

  /**
   * Update session metadata
   */
  updateMetadata(key: string, metadata: Record<string, unknown>): boolean {
    const entry = this.sessions.get(key);
    if (!entry) {
      return false;
    }

    entry.session.metadata = { ...entry.session.metadata, ...metadata };
    entry.session.updatedAt = Date.now();
    this.emitEvent("session:updated", entry.session);

    return true;
  }

  /**
   * Mark session as completed
   */
  completeSession(key: string, metadata?: Record<string, unknown>): boolean {
    if (metadata) {
      this.updateMetadata(key, metadata);
    }
    return this.updateStatus(key, "completed");
  }

  /**
   * Mark session as failed
   */
  failSession(key: string, error?: string): boolean {
    if (error) {
      this.updateMetadata(key, { error });
    }
    return this.updateStatus(key, "failed");
  }

  /**
   * Cancel a session and all its children
   */
  cancelSession(key: string): boolean {
    const entry = this.sessions.get(key);
    if (!entry) {
      return false;
    }

    // Cancel all children first
    for (const childKey of entry.children) {
      this.cancelSession(childKey);
    }

    return this.updateStatus(key, "cancelled");
  }

  /**
   * Get all children of a session
   */
  getChildren(key: string): SessionMetadata[] {
    const entry = this.sessions.get(key);
    if (!entry) {
      return [];
    }

    return Array.from(entry.children)
      .map((childKey) => this.sessions.get(childKey)?.session)
      .filter((s): s is SessionMetadata => s !== undefined);
  }

  /**
   * Get all descendants of a session
   */
  getDescendants(key: string): SessionMetadata[] {
    const descendants: SessionMetadata[] = [];
    const children = this.getChildren(key);
    
    for (const child of children) {
      descendants.push(child);
      descendants.push(...this.getDescendants(child.key));
    }

    return descendants;
  }

  /**
   * Get all ancestors of a session
   */
  getAncestors(key: string): SessionMetadata[] {
    const ancestorKeys = getAncestorKeys(key);
    return ancestorKeys
      .map((k) => this.sessions.get(k)?.session)
      .filter((s): s is SessionMetadata => s !== undefined);
  }

  /**
   * Get the session tree starting from a key
   */
  getTree(key: string): SessionTreeNode | null {
    const entry = this.sessions.get(key);
    if (!entry) {
      return null;
    }

    const children: SessionTreeNode[] = [];
    for (const childKey of entry.children) {
      const childTree = this.getTree(childKey);
      if (childTree) {
        children.push(childTree);
      }
    }

    return {
      key: entry.session.key,
      layer: entry.session.layer,
      status: entry.session.status,
      children,
      metadata: entry.session.metadata,
    };
  }

  /**
   * Get all active sessions at a specific layer
   */
  getActiveByLayer(layer: SessionLayer): SessionMetadata[] {
    return Array.from(this.sessions.values())
      .filter((entry) => entry.session.layer === layer && entry.session.status === "active")
      .map((entry) => entry.session);
  }

  /**
   * Get sessions by status
   */
  getByStatus(status: SessionStatus): SessionMetadata[] {
    return Array.from(this.sessions.values())
      .filter((entry) => entry.session.status === status)
      .map((entry) => entry.session);
  }

  /**
   * Get registry statistics
   */
  getStats(): SessionRegistryStats {
    const stats: SessionRegistryStats = {
      totalSessions: this.sessions.size,
      activeSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      byLayer: {
        orchestrator: 0,
        worker: 0,
        planner: 0,
        agent: 0,
      },
    };

    for (const entry of this.sessions.values()) {
      stats.byLayer[entry.session.layer]++;
      
      switch (entry.session.status) {
        case "active":
          stats.activeSessions++;
          break;
        case "completed":
          stats.completedSessions++;
          break;
        case "failed":
          stats.failedSessions++;
          break;
      }
    }

    return stats;
  }

  /**
   * Clean up completed/failed sessions older than maxAge (ms)
   */
  cleanup(maxAge: number = 3600000): number {
    const now = Date.now();
    const cutoff = now - maxAge;
    let removed = 0;

    for (const [key, entry] of this.sessions.entries()) {
      if (
        (entry.session.status === "completed" || 
         entry.session.status === "failed" || 
         entry.session.status === "cancelled") &&
        entry.session.updatedAt < cutoff
      ) {
        // Remove from parent's children
        if (entry.session.parentKey) {
          const parentEntry = this.sessions.get(entry.session.parentKey);
          if (parentEntry) {
            parentEntry.children.delete(key);
          }
        }
        this.sessions.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * Export all sessions for debugging/persistence
   */
  export(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map((entry) => entry.session);
  }

  /**
   * Import sessions from a backup
   */
  import(sessions: SessionMetadata[]): void {
    for (const session of sessions) {
      const entry: SessionRegistryEntry = {
        session,
        children: new Set(),
      };
      this.sessions.set(session.key, entry);
    }

    // Rebuild parent-child relationships
    for (const session of sessions) {
      if (session.parentKey) {
        const parentEntry = this.sessions.get(session.parentKey);
        if (parentEntry) {
          parentEntry.children.add(session.key);
        }
      }
    }
  }

  private getEventTypeForStatus(status: SessionStatus): SessionEventType | null {
    switch (status) {
      case "completed":
        return "session:completed";
      case "failed":
        return "session:failed";
      case "cancelled":
        return "session:cancelled";
      default:
        return null;
    }
  }

  private emitEvent(type: SessionEventType, session: SessionMetadata): void {
    const event: SessionEvent = {
      type,
      sessionKey: session.key,
      layer: session.layer,
      parentKey: session.parentKey,
      timestamp: Date.now(),
      metadata: session.metadata,
    };
    this.emit(type, event);
    this.emit("session", event);
  }
}

// Global registry instance
export const sessionRegistry = new SessionRegistry();
