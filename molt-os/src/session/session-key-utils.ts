// Session Key Utilities
// Parse and build hierarchical session keys like: molt:<orchestratorId>:worker:<workerId>:agent:<agentId>

import type { SessionKeyParts, SessionKeyInfo, SessionLayer } from "./types.js";
import { randomUUID } from "crypto";

const SESSION_PREFIX = "molt";
const LAYER_MARKERS = {
  orchestrator: "orch",
  worker: "worker",
  planner: "planner",
  agent: "agent",
} as const;

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Build an orchestrator-level session key
 * Format: molt:orch:<orchestratorId>
 */
export function buildOrchestratorKey(orchestratorId?: string): string {
  const id = orchestratorId || generateSessionId();
  return `${SESSION_PREFIX}:${LAYER_MARKERS.orchestrator}:${id}`;
}

/**
 * Build a worker-level session key
 * Format: molt:orch:<orchestratorId>:worker:<workerId>
 */
export function buildWorkerKey(orchestratorId: string, workerId?: string): string {
  const id = workerId || generateSessionId();
  return `${SESSION_PREFIX}:${LAYER_MARKERS.orchestrator}:${orchestratorId}:${LAYER_MARKERS.worker}:${id}`;
}

/**
 * Build a planner-level session key
 * Format: molt:orch:<orchestratorId>:worker:<workerId>:planner:<plannerId>
 */
export function buildPlannerKey(orchestratorId: string, workerId: string, plannerId?: string): string {
  const id = plannerId || generateSessionId();
  return `${SESSION_PREFIX}:${LAYER_MARKERS.orchestrator}:${orchestratorId}:${LAYER_MARKERS.worker}:${workerId}:${LAYER_MARKERS.planner}:${id}`;
}

/**
 * Build an agent-level session key
 * Format: molt:orch:<orchestratorId>:worker:<workerId>:agent:<agentId>
 */
export function buildAgentKey(orchestratorId: string, workerId: string, agentId?: string): string {
  const id = agentId || generateSessionId();
  return `${SESSION_PREFIX}:${LAYER_MARKERS.orchestrator}:${orchestratorId}:${LAYER_MARKERS.worker}:${workerId}:${LAYER_MARKERS.agent}:${id}`;
}

/**
 * Build a session key from parts
 */
export function buildSessionKey(parts: SessionKeyParts): string {
  if (parts.agentId) {
    return buildAgentKey(parts.orchestratorId, parts.workerId!, parts.agentId);
  }
  if (parts.plannerId) {
    return buildPlannerKey(parts.orchestratorId, parts.workerId!, parts.plannerId);
  }
  if (parts.workerId) {
    return buildWorkerKey(parts.orchestratorId, parts.workerId);
  }
  return buildOrchestratorKey(parts.orchestratorId);
}

/**
 * Parse a session key into its component parts
 */
export function parseSessionKey(key: string): SessionKeyInfo | null {
  const parts = key.split(":");
  
  if (parts.length < 3 || parts[0] !== SESSION_PREFIX) {
    return null;
  }

  const result: SessionKeyParts = {
    orchestratorId: "",
  };

  let layer: SessionLayer = "orchestrator";
  let i = 1;

  // Parse orchestrator
  if (parts[i] === LAYER_MARKERS.orchestrator && parts[i + 1]) {
    result.orchestratorId = parts[i + 1];
    i += 2;
  } else {
    return null;
  }

  // Parse worker if present
  if (i < parts.length && parts[i] === LAYER_MARKERS.worker && parts[i + 1]) {
    result.workerId = parts[i + 1];
    layer = "worker";
    i += 2;
  }

  // Parse planner if present
  if (i < parts.length && parts[i] === LAYER_MARKERS.planner && parts[i + 1]) {
    result.plannerId = parts[i + 1];
    layer = "planner";
    i += 2;
  }

  // Parse agent if present
  if (i < parts.length && parts[i] === LAYER_MARKERS.agent && parts[i + 1]) {
    result.agentId = parts[i + 1];
    layer = "agent";
    i += 2;
  }

  const parentKey = getParentKey(key);
  const depth = getKeyDepth(key);

  return {
    ...result,
    layer,
    fullKey: key,
    parentKey,
    depth,
  };
}

/**
 * Get the parent session key
 */
export function getParentKey(key: string): string | null {
  const parts = key.split(":");
  
  if (parts.length <= 3) {
    return null; // Orchestrator level has no parent
  }

  // Remove the last two parts (layer marker and id)
  return parts.slice(0, -2).join(":");
}

/**
 * Get all ancestor keys for a session key
 */
export function getAncestorKeys(key: string): string[] {
  const ancestors: string[] = [];
  let current = getParentKey(key);
  
  while (current) {
    ancestors.push(current);
    current = getParentKey(current);
  }
  
  return ancestors;
}

/**
 * Get the depth of a session key (0 = orchestrator, 1 = worker, 2 = planner/agent)
 */
export function getKeyDepth(key: string): number {
  const info = key.split(":");
  // molt:orch:id = 3 parts = depth 0
  // molt:orch:id:worker:id = 5 parts = depth 1
  // molt:orch:id:worker:id:agent:id = 7 parts = depth 2
  return Math.floor((info.length - 3) / 2);
}

/**
 * Get the layer of a session key
 */
export function getKeyLayer(key: string): SessionLayer | null {
  const info = parseSessionKey(key);
  return info?.layer ?? null;
}

/**
 * Check if keyA is an ancestor of keyB
 */
export function isAncestorOf(keyA: string, keyB: string): boolean {
  const ancestors = getAncestorKeys(keyB);
  return ancestors.includes(keyA);
}

/**
 * Check if keyA is a descendant of keyB
 */
export function isDescendantOf(keyA: string, keyB: string): boolean {
  return isAncestorOf(keyB, keyA);
}

/**
 * Check if two keys share the same orchestrator
 */
export function shareOrchestrator(keyA: string, keyB: string): boolean {
  const infoA = parseSessionKey(keyA);
  const infoB = parseSessionKey(keyB);
  
  if (!infoA || !infoB) {
    return false;
  }
  
  return infoA.orchestratorId === infoB.orchestratorId;
}

/**
 * Create a child session key
 */
export function createChildKey(parentKey: string, childLayer: SessionLayer, childId?: string): string | null {
  const info = parseSessionKey(parentKey);
  if (!info) {
    return null;
  }

  const id = childId || generateSessionId();

  switch (childLayer) {
    case "worker":
      if (info.layer === "orchestrator") {
        return buildWorkerKey(info.orchestratorId, id);
      }
      break;
    case "planner":
      if (info.layer === "worker") {
        return buildPlannerKey(info.orchestratorId, info.workerId!, id);
      }
      break;
    case "agent":
      if (info.layer === "worker") {
        return buildAgentKey(info.orchestratorId, info.workerId!, id);
      }
      break;
  }

  return null;
}

/**
 * Extract IDs from a session key as an array
 */
export function extractIds(key: string): string[] {
  const info = parseSessionKey(key);
  if (!info) {
    return [];
  }

  const ids: string[] = [info.orchestratorId];
  if (info.workerId) ids.push(info.workerId);
  if (info.plannerId) ids.push(info.plannerId);
  if (info.agentId) ids.push(info.agentId);

  return ids;
}
