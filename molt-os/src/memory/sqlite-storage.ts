import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "sqlite3";
import { MemoryStorage, MemoryEntry, MemoryStats, MemoryType } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SqliteMemoryStorageOptions {
  dbPath?: string;
}

export class SqliteMemoryStorage implements MemoryStorage {
  private db: Database;
  private dbPath: string;

  constructor(options: SqliteMemoryStorageOptions = {}) {
    this.dbPath = options.dbPath || path.join(__dirname, "..", "..", "data", "memory.db");
    this.db = new Database(this.dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS memory (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          namespace TEXT DEFAULT 'default',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER,
          metadata TEXT
        )
      `);

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_namespace ON memory(namespace)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_expires ON memory(expires_at)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_key_namespace ON memory(key, namespace)`);
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private serializeValue(value: unknown): string {
    return JSON.stringify(value);
  }

  private deserializeValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async get(key: string, namespace: string = "default"): Promise<MemoryEntry | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM memory WHERE key = ? AND namespace = ? AND (expires_at IS NULL OR expires_at > ?)`,
        [key, namespace, Date.now()],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          if (!row) {
            resolve(null);
            return;
          }
          resolve({
            id: row.id,
            type: row.type as MemoryType,
            key: row.key,
            value: this.deserializeValue(row.value),
            namespace: row.namespace,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            expiresAt: row.expires_at || undefined,
            metadata: row.metadata
              ? (this.deserializeValue(row.metadata) as Record<string, unknown>)
              : undefined,
          });
        },
      );
    });
  }

  async set(
    key: string,
    value: unknown,
    namespace: string = "default",
    ttl?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const id = this.generateId();
    const now = Date.now();
    const expiresAt = ttl ? now + ttl : null;

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO memory (id, type, key, value, namespace, created_at, updated_at, expires_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          "context",
          key,
          this.serializeValue(value),
          namespace,
          now,
          now,
          expiresAt,
          metadata ? this.serializeValue(metadata) : null,
        ],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  async delete(key: string, namespace: string = "default"): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM memory WHERE key = ? AND namespace = ?`,
        [key, namespace],
        function (err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        },
      );
    });
  }

  async clear(namespace?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = namespace ? `DELETE FROM memory WHERE namespace = ?` : `DELETE FROM memory`;

      const params = namespace ? [namespace] : [];

      this.db.run(query, params, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async keys(namespace?: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const query = namespace
        ? `SELECT key FROM memory WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)`
        : `SELECT key FROM memory WHERE (expires_at IS NULL OR expires_at > ?)`;

      const params = namespace ? [namespace, Date.now()] : [Date.now()];

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map((row: { key: string }) => row.key));
      });
    });
  }

  async entries(namespace?: string): Promise<MemoryEntry[]> {
    return new Promise((resolve, reject) => {
      const query = namespace
        ? `SELECT * FROM memory WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)`
        : `SELECT * FROM memory WHERE (expires_at IS NULL OR expires_at > ?)`;

      const params = namespace ? [namespace, Date.now()] : [Date.now()];

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          rows.map((row: Record<string, unknown>) => ({
            id: row.id,
            type: row.type as MemoryType,
            key: row.key,
            value: this.deserializeValue(row.value as string),
            namespace: row.namespace,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            expiresAt: row.expires_at || undefined,
            metadata: row.metadata
              ? (this.deserializeValue(row.metadata as string) as Record<string, unknown>)
              : undefined,
          })),
        );
      });
    });
  }

  async stats(): Promise<MemoryStats> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count, SUM(LENGTH(value)) as size FROM memory`,
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          this.db.all(
            `SELECT namespace, COUNT(*) as count, SUM(LENGTH(value)) as size FROM memory GROUP BY namespace`,
            (err, namespaceRows) => {
              if (err) {
                reject(err);
                return;
              }

              const namespaces: Record<string, { entries: number; size: number }> = {};
              for (const nsRow of namespaceRows) {
                namespaces[nsRow.namespace] = {
                  entries: nsRow.count,
                  size: nsRow.size || 0,
                };
              }

              resolve({
                totalEntries: row?.count || 0,
                totalSize: row?.size || 0,
                namespaces,
              });
            },
          );
        },
      );
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}
