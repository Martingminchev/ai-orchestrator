import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildHierarchicalContext,
  getLocationContextChain,
  mergeContextLayers,
  getContextForAgent,
  getAllContexts,
} from "../../src/context/hierarchy";

const testDir = path.join(__dirname, "hierarchy-test-fixtures");

beforeAll(() => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, ".molt"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "level1", "level2"), { recursive: true });
  fs.mkdirSync(path.join(testDir, ".molt", "skills"), { recursive: true });

  fs.writeFileSync(
    path.join(testDir, ".molt", "global.md"),
    `---
name: global
description: Global context
---

# Global Context

This is the global context applied to all operations.
`,
  );

  fs.writeFileSync(
    path.join(testDir, ".molt.md"),
    `---
name: project
description: Project-level context
---

# Project Context

This is project-level context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, "level1", ".molt.md"),
    `---
name: level1
description: Level 1 directory context
---

# Level 1 Context

This is level 1 directory context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, "level1", "level2", ".molt.md"),
    `---
name: level2
description: Level 2 directory context
---

# Level 2 Context

This is nested level 2 context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, ".molt", "skills", "test-agent.md"),
    `---
name: test-agent
description: Test agent instructions
---

# Test Agent

This is test agent specific context.
`,
  );
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("buildHierarchicalContext", () => {
  it("should build hierarchical context with all layers", () => {
    const result = buildHierarchicalContext(testDir);

    expect(result.global).not.toBeNull();
    expect(result.global!.name).toBe("global");
    expect(result.locations.length).toBeGreaterThanOrEqual(1);
    expect(result.skills.size).toBeGreaterThanOrEqual(1);
  });

  it("should include global context", () => {
    const result = buildHierarchicalContext(testDir);

    expect(result.global).not.toBeNull();
    expect(result.global!.content).toContain("Global Context");
  });

  it("should include location contexts", () => {
    const result = buildHierarchicalContext(testDir);

    expect(result.locations.length).toBeGreaterThan(0);
  });

  it("should include skill contexts", () => {
    const result = buildHierarchicalContext(testDir);

    expect(result.skills.has("test-agent")).toBe(true);
  });
});

describe("getLocationContextChain", () => {
  it("should return location contexts in order from root to current", () => {
    const chain = getLocationContextChain(path.join(testDir, "level1", "level2"));

    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  it("should order contexts from outer to inner", () => {
    const chain = getLocationContextChain(path.join(testDir, "level1", "level2"));

    if (chain.length >= 2) {
      expect(chain[0].frontmatter.name).not.toBe("level2");
    }
  });
});

describe("mergeContextLayers", () => {
  it("should merge global and location contexts", () => {
    const hierarchical = buildHierarchicalContext(testDir);
    const merged = mergeContextLayers(hierarchical);

    expect(merged).toContain("Global Context");
    expect(merged).toContain("Project Context");
  });

  it("should include skill context when specified", () => {
    const hierarchical = buildHierarchicalContext(testDir);
    const merged = mergeContextLayers(hierarchical, "test-agent");

    expect(merged).toContain("Test Agent");
  });

  it("should separate layers with horizontal rules", () => {
    const hierarchical = buildHierarchicalContext(testDir);
    const merged = mergeContextLayers(hierarchical);

    expect(merged).toContain("\n\n---\n\n");
  });
});

describe("getContextForAgent", () => {
  it("should return context for specified agent type", () => {
    const context = getContextForAgent(testDir, "test-agent");

    expect(context).toContain("Test Agent");
  });

  it("should include global context by default", () => {
    const context = getContextForAgent(testDir, "test-agent");

    expect(context).toContain("Global Context");
  });

  it("should include location context by default", () => {
    const context = getContextForAgent(testDir, "test-agent");

    expect(context).toContain("Project Context");
  });

  it("should exclude global when option is false", () => {
    const context = getContextForAgent(testDir, "test-agent", { includeGlobal: false });

    expect(context).not.toContain("Global Context");
  });

  it("should exclude location when option is false", () => {
    const context = getContextForAgent(testDir, "test-agent", { includeLocation: false });

    expect(context).not.toContain("Project Context");
  });

  it("should exclude skills when option is false", () => {
    const context = getContextForAgent(testDir, "test-agent", { includeSkills: false });

    expect(context).not.toContain("Test Agent");
  });
});

describe("getAllContexts", () => {
  it("should return all context layers", () => {
    const all = getAllContexts(testDir);

    expect(typeof all.global).toBe("string");
    expect(Array.isArray(all.locations)).toBe(true);
    expect(typeof all.skills).toBe("string");
    expect(Array.isArray(all.rag)).toBe(true);
  });

  it("should have non-empty global context", () => {
    const all = getAllContexts(testDir);

    expect(all.global.length).toBeGreaterThan(0);
  });

  it("should have location contexts", () => {
    const all = getAllContexts(testDir);

    expect(all.locations.length).toBeGreaterThan(0);
  });
});
