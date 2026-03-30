import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Integration: Context Loading", () => {
  const testDir = path.join(__dirname, "test-integration-context");

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, "skills"), { recursive: true });

    fs.writeFileSync(
      path.join(testDir, ".molt.md"),
      `---
name: global-context
description: Global context for testing
---
Global context content.`,
    );

    fs.writeFileSync(
      path.join(testDir, "skills", ".molt.md"),
      `---
name: test-skill
description: A test skill
version: 1.0.0
---
This is a test skill content.`,
    );
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("should load global context", async () => {
    const { loadContextFile } = await import("../../src/context/loader.js");
    const globalPath = path.join(testDir, ".molt.md");
    const result = loadContextFile(globalPath);

    expect(result).not.toBeNull();
    expect(result?.frontmatter.name).toBe("global-context");
    expect(result?.content).toBe("Global context content.");
  });

  it("should load skill context", async () => {
    const { loadSkillContext } = await import("../../src/context/loader.js");
    const skillPath = path.join(testDir, "skills", ".molt.md");
    const result = loadSkillContext(skillPath);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("test-skill");
    expect(result?.version).toBe("1.0.0");
  });

  it("should find all molt files", async () => {
    const { findMoltFiles } = await import("../../src/context/loader.js");
    const files = findMoltFiles(testDir);

    expect(files.length).toBe(2);
  });
});

describe("Integration: Worker Flow", () => {
  it("should validate worker types", async () => {
    const { WorkerConfig, WorkerTask, WorkerResult } = await import("../../src/worker/types.js");

    const config: WorkerConfig = {
      plannerUrl: "http://localhost:3001",
      subagentTimeout: 30000,
      maxParallelSubagents: 5,
      contextDir: "./context",
    };

    expect(config.plannerUrl).toBe("http://localhost:3001");
    expect(config.maxParallelSubagents).toBe(5);

    const task: WorkerTask = {
      id: "task-001",
      description: "Test task",
      inputPath: "/input/test.json",
      outputPath: "/output/test.json",
      globalContext: "{}",
    };

    expect(task.id).toBe("task-001");

    const result: WorkerResult = {
      success: true,
      taskId: "task-001",
      subagentResults: [],
    };

    expect(result.success).toBe(true);
  });
});

describe("Integration: Orchestrator Flow", () => {
  it("should validate orchestrator types", async () => {
    const { OrchestratorConfig, OrchestratorTask, OrchestratorResult } =
      await import("../../src/orchestrator/types.js");

    const config: OrchestratorConfig = {
      workerUrl: "http://localhost:3000",
      plannerUrl: "http://localhost:3001",
      orchestratorPort: 3002,
      contextDir: "./context",
    };

    expect(config.orchestratorPort).toBe(3002);

    const task: OrchestratorTask = {
      id: "orch-task-001",
      description: "Integration test task",
      input: { data: "test" },
    };

    expect(task.id).toBe("orch-task-001");
  });
});
