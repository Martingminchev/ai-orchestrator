import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  injectContext,
  injectContextWithoutFileWrite,
  getInMemoryContext,
  clearContextCache,
  buildPromptWithContext,
  preloadContextCache,
} from "../../src/context/in-memory";

const testDir = path.join(__dirname, "inmemory-test-fixtures");

beforeAll(() => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, ".molt"), { recursive: true });
  fs.mkdirSync(path.join(testDir, ".molt", "skills"), { recursive: true });

  fs.writeFileSync(
    path.join(testDir, ".molt", "global.md"),
    `---
name: global
description: Global context
---

# Global

This is global context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, ".molt.md"),
    `---
name: local
description: Local context
---

# Local

This is local context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, ".molt", "skills", "test-agent.md"),
    `---
name: test-agent
description: Test agent
---

# Test Agent

This is agent context.
`,
  );
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  clearContextCache();
});

describe("injectContext", () => {
  it("should inject context into prompt", () => {
    const prompt = "Write a function.";
    const result = injectContext(prompt, testDir, "test-agent");

    expect(result).toContain("Write a function.");
    expect(result).toContain("Global");
    expect(result).toContain("Local");
    expect(result).toContain("Test Agent");
    expect(result).toContain("Current Task");
  });

  it("should prepend context before prompt", () => {
    const prompt = "My prompt";
    const result = injectContext(prompt, testDir, "test-agent");

    const index = result.indexOf("My prompt");
    expect(index).toBeGreaterThan(0);
    expect(result.substring(0, index)).toContain("Global");
  });

  it("should respect includeGlobal option", () => {
    const prompt = "Test";
    const result = injectContext(prompt, testDir, "test-agent", { includeGlobal: false });

    expect(result).not.toContain("This is global context.");
  });

  it("should respect includeLocation option", () => {
    const prompt = "Test";
    const result = injectContext(prompt, testDir, "test-agent", { includeLocation: false });

    expect(result).not.toContain("This is local context.");
  });

  it("should respect includeSkills option", () => {
    const prompt = "Test";
    const result = injectContext(prompt, testDir, "test-agent", { includeSkills: false });

    expect(result).not.toContain("This is agent context.");
  });
});

describe("injectContextWithoutFileWrite", () => {
  it("should inject context without file writes", () => {
    const prompt = "Task description";
    const result = injectContextWithoutFileWrite(prompt, testDir, "test-agent");

    expect(result).toContain("Task description");
    expect(result).toContain("Global");
    expect(result).toContain("Local");
    expect(result).toContain("Test Agent");
  });
});

describe("getInMemoryContext", () => {
  it("should return cached context", () => {
    const first = getInMemoryContext(testDir, "test-agent");
    const second = getInMemoryContext(testDir, "test-agent");

    expect(first).toBe(second);
  });

  it("should return context for different agents", () => {
    const testAgent = getInMemoryContext(testDir, "test-agent");

    expect(testAgent).toContain("Test Agent");
  });

  it("should use cache to avoid recomputation", () => {
    const start = Date.now();
    getInMemoryContext(testDir, "test-agent");
    getInMemoryContext(testDir, "test-agent");
    getInMemoryContext(testDir, "test-agent");
    const end = Date.now();

    expect(end - start).toBeLessThan(100);
  });
});

describe("clearContextCache", () => {
  it("should clear all cache", () => {
    getInMemoryContext(testDir, "test-agent");
    clearContextCache();

    const result = getInMemoryContext(testDir, "test-agent");
    expect(typeof result).toBe("string");
  });

  it("should clear specific key", () => {
    getInMemoryContext(testDir, "agent1");
    getInMemoryContext(testDir, "agent2");
    clearContextCache(`${testDir}:agent1`);

    const result = getInMemoryContext(testDir, "agent1");
    expect(typeof result).toBe("string");
  });
});

describe("buildPromptWithContext", () => {
  it("should build prompt with all context layers", () => {
    const result = buildPromptWithContext("Do this task.", {
      global: "Global context",
      location: "Location context",
      skill: "Skill context",
      rag: ["RAG item 1", "RAG item 2"],
    });

    expect(result).toContain("Do this task.");
    expect(result).toContain("Global context");
    expect(result).toContain("Location context");
    expect(result).toContain("Skill context");
    expect(result).toContain("RAG item 1");
    expect(result).toContain("RAG item 2");
  });

  it("should handle missing context layers", () => {
    const result = buildPromptWithContext("Task", {
      global: "Global",
    });

    expect(result).toContain("Task");
    expect(result).toContain("Global");
  });

  it("should handle empty RAG array", () => {
    const result = buildPromptWithContext("Task", {
      global: "Global",
      rag: [],
    });

    expect(result).not.toContain("undefined");
  });
});

describe("preloadContextCache", () => {
  it("should preload contexts for specified agents", () => {
    preloadContextCache(testDir, ["test-agent", "other-agent"]);

    const result = getInMemoryContext(testDir, "test-agent");
    expect(typeof result).toBe("string");
  });
});
