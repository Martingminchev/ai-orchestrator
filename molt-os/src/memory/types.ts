export interface MemoryEntry {
  id: string;
  type: MemoryType;
  key: string;
  value: unknown;
  namespace: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export type MemoryType = "context" | "result" | "cache" | "session" | "state";

export interface MemoryNamespace {
  name: string;
  ttl: number;
  maxSize: number;
}

export interface MemoryStats {
  totalEntries: number;
  totalSize: number;
  namespaces: Record<string, { entries: number; size: number }>;
}

export interface MemoryStorage {
  get(key: string, namespace?: string): Promise<MemoryEntry | null>;
  set(
    key: string,
    value: unknown,
    namespace?: string,
    ttl?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  delete(key: string, namespace?: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
  keys(namespace?: string): Promise<string[]>;
  entries(namespace?: string): Promise<MemoryEntry[]>;
  stats(): Promise<MemoryStats>;
  close(): Promise<void>;
}
