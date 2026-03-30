import { describe, it, expect } from "vitest";
import { MemoryEntry, MemoryType } from "./src/memory/types.js";

describe("Memory Types", () => {
  describe("MemoryEntry", () => {
    it("should have required properties", () => {
      const entry: MemoryEntry = {
        id: "test-123",
        type: "context",
        key: "test-key",
        value: { data: "test" },
        namespace: "test-ns",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(entry.id).toBe("test-123");
      expect(entry.type).toBe("context");
      expect(entry.key).toBe("test-key");
      expect(entry.value).toEqual({ data: "test" });
      expect(entry.namespace).toBe("test-ns");
    });

    it("should support optional properties", () => {
      const now = Date.now();
      const entry: MemoryEntry = {
        id: "test-456",
        type: "cache",
        key: "cache-key",
        value: "cached-value",
        namespace: "cache",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 3600000,
        metadata: { version: "1.0" },
      };

      expect(entry.expiresAt).toBeDefined();
      expect(entry.metadata?.version).toBe("1.0");
    });
  });

  describe("MemoryType", () => {
    it("should support all memory types", () => {
      const types: MemoryType[] = ["context", "result", "cache", "session", "state"];
      types.forEach((type) => {
        expect(["context", "result", "cache", "session", "state"]).toContain(type);
      });
    });
  });
});
