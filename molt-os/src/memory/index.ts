import { MemoryStorage, MemoryEntry, MemoryStats, MemoryType } from "./types.js";
import { SqliteMemoryStorage } from "./sqlite-storage.js";
import { createLogger, Logger } from "../utils/logger.js";

const logger = createLogger("memory-manager");

export class MemoryManager {
  private storage: MemoryStorage;
  private namespaces: Map<string, { ttl: number; maxSize: number }>;

  constructor(storage?: MemoryStorage) {
    this.storage = storage || new SqliteMemoryStorage();
    this.namespaces = new Map();
    this.registerDefaultNamespaces();
  }

  private registerDefaultNamespaces(): void {
    this.namespaces.set("context", { ttl: 86400000, maxSize: 1000 });
    this.namespaces.set("result", { ttl: 604800000, maxSize: 500 });
    this.namespaces.set("cache", { ttl: 3600000, maxSize: 2000 });
    this.namespaces.set("session", { ttl: 86400000, maxSize: 100 });
    this.namespaces.set("state", { ttl: Infinity, maxSize: 100 });
  }

  async get<T = unknown>(key: string, namespace: string = "context"): Promise<T | null> {
    const entry = await this.storage.get(key, namespace);
    if (!entry) {
      return null;
    }
    return entry.value as T;
  }

  async set<T = unknown>(
    key: string,
    value: T,
    namespace: string = "context",
    ttl?: number,
  ): Promise<void> {
    const nsConfig = this.namespaces.get(namespace) || { ttl: 3600000, maxSize: 1000 };
    const effectiveTtl = ttl || nsConfig.ttl;

    await this.storage.set(key, value, namespace, effectiveTtl);
    logger.debug("Memory entry set", { key, namespace });
  }

  async delete(key: string, namespace: string = "context"): Promise<boolean> {
    const result = await this.storage.delete(key, namespace);
    if (result) {
      logger.debug("Memory entry deleted", { key, namespace });
    }
    return result;
  }

  async clear(namespace?: string): Promise<void> {
    await this.storage.clear(namespace);
    logger.info("Memory cleared", { namespace: namespace || "all" });
  }

  async keys(namespace?: string): Promise<string[]> {
    return this.storage.keys(namespace);
  }

  async entries(namespace?: string): Promise<MemoryEntry[]> {
    return this.storage.entries(namespace);
  }

  async stats(): Promise<MemoryStats> {
    return this.storage.stats();
  }

  registerNamespace(name: string, ttl: number, maxSize: number): void {
    this.namespaces.set(name, { ttl, maxSize });
    logger.info("Namespace registered", { name, ttl, maxSize });
  }

  async cleanup(): Promise<number> {
    const entries = await this.storage.entries();
    let cleaned = 0;
    const now = Date.now();

    for (const entry of entries) {
      if (entry.expiresAt && entry.expiresAt < now) {
        await this.storage.delete(entry.key, entry.namespace);
        cleaned++;
      }
    }

    logger.info("Memory cleanup completed", { cleaned });
    return cleaned;
  }

  async close(): Promise<void> {
    await this.storage.close();
    logger.info("Memory manager closed");
  }
}

let memoryManager: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!memoryManager) {
    memoryManager = new MemoryManager();
  }
  return memoryManager;
}

export async function withMemoryContext<T>(
  namespace: string,
  operation: (manager: MemoryManager) => Promise<T>,
): Promise<T> {
  const manager = getMemoryManager();
  return operation(manager);
}
