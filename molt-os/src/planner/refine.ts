import { DraftPlan, RefinedPlan, RefinedStep, Checkpoint, PlanConstraint } from "./types";

export interface RefinementOptions {
  optimizeForSpeed: boolean;
  optimizeForQuality: boolean;
  riskTolerance: "low" | "medium" | "high";
  parallelizeWherePossible: boolean;
}

export class PlanRefiner {
  private options: RefinementOptions;

  constructor(options?: Partial<RefinementOptions>) {
    this.options = {
      optimizeForSpeed: options?.optimizeForSpeed || false,
      optimizeForQuality: options?.optimizeForQuality || true,
      riskTolerance: options?.riskTolerance || "medium",
      parallelizeWherePossible: options?.parallelizeWherePossible || true,
      ...options,
    };
  }

  refine(draftPlan: DraftPlan, constraints?: PlanConstraint[]): RefinedPlan {
    const refinedSteps = this.refineSteps(draftPlan.steps);
    const executionOrder = this.calculateExecutionOrder(refinedSteps, draftPlan.dependencies);
    const checkpoints = this.createCheckpoints(refinedSteps, constraints);
    const riskLevel = this.assessRisk(refinedSteps);
    const totalEstimatedTime = this.calculateTotalTime(refinedSteps);

    return {
      steps: refinedSteps,
      executionOrder,
      totalEstimatedTime,
      riskLevel,
      checkpoints,
    };
  }

  private refineSteps(steps: DraftPlan["steps"]): RefinedStep[] {
    return steps.map((step, index) => {
      const refinedStep: RefinedStep = {
        id: step.id,
        description: step.description,
        subagentType: step.subagentType,
        expectedOutput: step.expectedOutput,
        dependencies: step.dependencies,
        priority: step.priority,
        validationCriteria: this.generateValidationCriteria(step),
        rollbackStrategy: this.generateRollbackStrategy(step),
      };

      return refinedStep;
    });
  }

  private generateValidationCriteria(step: DraftPlan["steps"][0]): string[] {
    const criteria: string[] = [
      `Output file exists at ${step.expectedOutput}`,
      "Output is valid JSON",
      "Output contains expected fields",
    ];

    return criteria;
  }

  private generateRollbackStrategy(step: DraftPlan["steps"][0]): string {
    return `If ${step.id} fails:
1. Log the error
2. Remove any created files
3. Notify parent process
4. Attempt cleanup of dependent steps`;
  }

  private calculateExecutionOrder(
    refinedSteps: RefinedStep[],
    originalDependencies: DraftPlan["dependencies"],
  ): string[] {
    const stepMap = new Map(refinedSteps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        const dependencies = originalDependencies[stepId] || step.dependencies;
        dependencies.forEach((depId) => visit(depId));
        order.push(stepId);
      }
    };

    refinedSteps.forEach((step) => visit(step.id));

    return order;
  }

  private createCheckpoints(
    refinedSteps: RefinedStep[],
    constraints?: PlanConstraint[],
  ): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];
    let stepIndex = 0;

    while (stepIndex < refinedSteps.length) {
      const batch: string[] = [];
      const batchValidation: string[] = [];

      for (let i = 0; i < 2 && stepIndex < refinedSteps.length; i++) {
        const step = refinedSteps[stepIndex];
        batch.push(step.id);
        batchValidation.push(...step.validationCriteria);
        stepIndex++;
      }

      checkpoints.push({
        stepId: batch.join(","),
        validationRequired: batchValidation,
        continueOnFailure: this.options.riskTolerance !== "low",
      });
    }

    return checkpoints;
  }

  private assessRisk(steps: RefinedStep[]): "low" | "medium" | "high" {
    const riskFactors = steps.reduce((count, step) => {
      if (step.subagentType === "coder") return count + 2;
      if (step.subagentType === "researcher") return count + 1;
      return count;
    }, 0);

    if (riskFactors <= 2) return "low";
    if (riskFactors <= 5) return "medium";
    return "high";
  }

  private calculateTotalTime(steps: RefinedStep[]): number {
    const baseTime = 300000;
    const perStepTime = 120000;

    return baseTime + steps.length * perStepTime;
  }

  optimize(refinedPlan: RefinedPlan): RefinedPlan {
    if (this.options.optimizeForSpeed) {
      return this.optimizeForSpeed(refinedPlan);
    }

    if (this.options.optimizeForQuality) {
      return this.optimizeForQuality(refinedPlan);
    }

    return refinedPlan;
  }

  private optimizeForSpeed(plan: RefinedPlan): RefinedPlan {
    const sortedSteps = [...plan.steps].sort((a, b) => a.priority - b.priority);

    return {
      ...plan,
      steps: sortedSteps,
      totalEstimatedTime: plan.totalEstimatedTime * 0.7,
    };
  }

  private optimizeForQuality(plan: RefinedPlan): RefinedPlan {
    const enhancedSteps = plan.steps.map((step) => ({
      ...step,
      validationCriteria: [
        ...step.validationCriteria,
        "Quality gates passed",
        "Code review completed",
      ],
    }));

    return {
      ...plan,
      steps: enhancedSteps,
      totalEstimatedTime: plan.totalEstimatedTime * 1.3,
    };
  }
}

export function validatePlan(plan: RefinedPlan): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stepIds = new Set(plan.steps.map((s) => s.id));

  for (const step of plan.steps) {
    for (const dep of step.dependencies) {
      if (!stepIds.has(dep)) {
        errors.push(`Step ${step.id} references non-existent dependency ${dep}`);
      }
    }
  }

  if (plan.executionOrder.length !== plan.steps.length) {
    warnings.push("Execution order may not include all steps");
  }

  if (plan.checkpoints.length === 0) {
    warnings.push("No checkpoints defined for progress tracking");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
