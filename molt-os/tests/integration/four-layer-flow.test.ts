import * as fs from "fs";
import * as path from "path";
import { describe, it, beforeEach, afterEach, expect } from "vitest";

describe("Phase 3 Integration Tests", () => {
  describe("Orchestrator Layer", () => {
    it("should create orchestrator with default config", async () => {
      const { Orchestrator } = await import("../../src/orchestrator/index");
      const orchestrator = new Orchestrator();

      expect(orchestrator).toBeDefined();
    });

    it("should create orchestrator with custom config", async () => {
      const { Orchestrator } = await import("../../src/orchestrator/index");
      const orchestrator = new Orchestrator({
        workerDir: "/custom/work",
        maxRetries: 5,
      });

      expect(orchestrator).toBeDefined();
    });
  });

  describe("Worker Layer", () => {
    it("should create worker with default config", async () => {
      const { Worker } = await import("../../src/worker/index");
      const worker = new Worker();

      expect(worker).toBeDefined();
    });

    it("should create worker with custom config", async () => {
      const { Worker } = await import("../../src/worker/index");
      const worker = new Worker({
        maxParallelSubagents: 2,
        subagentTimeout: 60000,
      });

      expect(worker).toBeDefined();
    });

    it("should report status correctly", async () => {
      const { Worker } = await import("../../src/worker/index");
      const worker = new Worker();
      const status = worker.getStatus();

      expect(status).toHaveProperty("activeSubagents");
      expect(status).toHaveProperty("queuedSubagents");
    });
  });

  describe("Planner Layer", () => {
    it("should create planner with default config", async () => {
      const { Planner } = await import("../../src/planner/index");
      const planner = new Planner();

      expect(planner).toBeDefined();
    });

    it("should create planner with custom config", async () => {
      const { Planner } = await import("../../src/planner/index");
      const planner = new Planner({
        optimizationLevel: "fast",
        maxParallelResearch: 2,
      });

      expect(planner).toBeDefined();
    });
  });

  describe("IPC Communication", () => {
    it("should create worker-orchestrator IPC", async () => {
      const { WorkerOrchestratorIpc } = await import("../../src/ipc/worker-orchestrator");
      const ipc = WorkerOrchestratorIpc.createForWorker();

      expect(ipc).toBeDefined();
    });

    it("should create worker-planner IPC", async () => {
      const { WorkerPlannerIpc } = await import("../../src/ipc/worker-planner");
      const ipc = WorkerPlannerIpc.createForWorker();

      expect(ipc).toBeDefined();
    });
  });

  describe("Validation", () => {
    it("should validate orchestrator results", async () => {
      const { Validator } = await import("../../src/orchestrator/validate");
      const validator = new Validator();

      expect(validator).toBeDefined();
    });

    it("should validate subagent results", async () => {
      const { SubagentValidator } = await import("../../src/worker/validate");
      const validator = new SubagentValidator();

      expect(validator).toBeDefined();
    });
  });

  describe("Context Management", () => {
    it("should write context files", async () => {
      const { ContextWriter } = await import("../../src/worker/write-context");
      const testDir = path.join(__dirname, "test_context");

      const writer = new ContextWriter(testDir);
      const result = await writer.writeContext({
        path: "test.md",
        content: "Test content",
        priority: 1,
      });

      expect(result).toContain(testDir);

      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it("should create context manager", async () => {
      const { ContextManager } = await import("../../src/worker/context-manager");
      const manager = new ContextManager();

      expect(manager).toBeDefined();
    });
  });

  describe("Plan Refinement", () => {
    it("should refine draft plans", async () => {
      const { PlanRefiner } = await import("../../src/planner/refine");
      const refiner = new PlanRefiner();

      const draftPlan = {
        taskId: "test_task",
        steps: [
          {
            id: "step_1",
            description: "Test step",
            subagentType: "writer",
            expectedOutput: "/output/test.json",
            dependencies: [],
            priority: 1,
          },
        ],
        dependencies: {},
        estimatedTime: 300000,
        resources: ["writer"],
      };

      const refined = refiner.refine(draftPlan);

      expect(refined.steps).toHaveLength(1);
      expect(refined.executionOrder).toContain("step_1");
    });

    it("should validate refined plans", async () => {
      const { validatePlan } = await import("../../src/planner/refine");

      const plan = {
        steps: [
          {
            id: "step_1",
            description: "Test step",
            subagentType: "writer",
            expectedOutput: "/output/test.json",
            dependencies: [],
            priority: 1,
            validationCriteria: [],
            rollbackStrategy: "",
          },
        ],
        executionOrder: ["step_1"],
        totalEstimatedTime: 300000,
        riskLevel: "low" as const,
        checkpoints: [],
      };

      const result = validatePlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Subagent Spawning", () => {
    it("should create subagent spawner", async () => {
      const { SubagentSpawner } = await import("../../src/worker/spawn-subagent");
      const spawner = new SubagentSpawner(2);

      expect(spawner).toBeDefined();
    });

    it("should create subagent config", async () => {
      const { createSubagentConfig } = await import("../../src/worker/spawn-subagent");

      const config = createSubagentConfig(
        "test_id",
        "writer",
        "Test task",
        [{ path: "context.md", content: "Context", priority: 1 }],
        "/tmp/work",
      );

      expect(config.id).toBe("test_id");
      expect(config.type).toBe("writer");
    });
  });

  describe("Parallel Task Execution", () => {
    it("should create parallel task executor", async () => {
      const { ParallelTaskExecutor } = await import("../../src/planner/parallel");
      const executor = new ParallelTaskExecutor({ maxParallel: 2 });

      expect(executor).toBeDefined();
    });

    it("should create research tasks", async () => {
      const { createResearchTasks } = await import("../../src/planner/parallel");

      const tasks = await createResearchTasks(
        "How to implement feature X",
        ["docs", "examples"],
        ["medium", "deep"],
      );

      expect(tasks).toHaveLength(2);
    });
  });
});
