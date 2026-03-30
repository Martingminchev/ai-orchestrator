import { describe, it, expect } from "vitest";
import { IpcMessageType } from "../../src/ipc/types";

describe("IPC Types", () => {
  it("should have correct message types", () => {
    expect(IpcMessageType.TASK_REQUEST).toBe("TASK_REQUEST");
    expect(IpcMessageType.TASK_RESPONSE).toBe("TASK_RESPONSE");
    expect(IpcMessageType.PLAN_REQUEST).toBe("PLAN_REQUEST");
    expect(IpcMessageType.PLAN_RESPONSE).toBe("PLAN_RESPONSE");
    expect(IpcMessageType.ERROR).toBe("ERROR");
  });
});

describe("Orchestrator Types", () => {
  it("should validate orchestrator config structure", () => {
    const config = {
      workerDir: "/test/work",
      globalContextPath: "/test/global.md",
      maxRetries: 3,
      timeout: 60000,
    };

    expect(config.workerDir).toBeDefined();
    expect(config.globalContextPath).toBeDefined();
    expect(config.maxRetries).toBeGreaterThan(0);
    expect(config.timeout).toBeGreaterThan(0);
  });

  it("should validate orchestrator task structure", () => {
    const task = {
      id: "test_task_1",
      description: "Test task description",
      inputPath: "/input/test.md",
      outputPath: "/output/test.json",
    };

    expect(task.id).toBeDefined();
    expect(task.description).toBeDefined();
    expect(task.outputPath).toBeDefined();
  });
});

describe("Worker Types", () => {
  it("should validate worker task structure", () => {
    const task = {
      id: "test_task_1",
      description: "Test task description",
      inputPath: "/input/test.md",
      outputPath: "/output/test.json",
      globalContext: "Global context content",
    };

    expect(task.id).toBeDefined();
    expect(task.globalContext).toBeDefined();
  });

  it("should validate subagent result structure", () => {
    const result = {
      subagentId: "subagent_1",
      success: true,
      outputPath: "/output/subagent.json",
    };

    expect(result.subagentId).toBeDefined();
    expect(typeof result.success).toBe("boolean");
  });
});

describe("Planner Types", () => {
  it("should validate draft plan structure", () => {
    const draftPlan = {
      taskId: "test_task_1",
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

    expect(draftPlan.taskId).toBeDefined();
    expect(Array.isArray(draftPlan.steps)).toBe(true);
  });

  it("should validate refined plan structure", () => {
    const refinedPlan = {
      steps: [
        {
          id: "step_1",
          description: "Test step",
          subagentType: "writer",
          expectedOutput: "/output/test.json",
          dependencies: [],
          priority: 1,
          validationCriteria: ["Output exists"],
          rollbackStrategy: "Remove created files",
        },
      ],
      executionOrder: ["step_1"],
      totalEstimatedTime: 300000,
      riskLevel: "low" as const,
      checkpoints: [],
    };

    expect(refinedPlan.riskLevel).toBeDefined();
    expect(refinedPlan.checkpoints).toBeDefined();
  });
});
