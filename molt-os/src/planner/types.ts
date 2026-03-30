export interface PlannerConfig {
  researchTimeout: number;
  maxParallelResearch: number;
  optimizationLevel: "fast" | "thorough";
}

export interface PlannerInput {
  taskId: string;
  draftPlan: DraftPlan;
  context: string;
  constraints?: PlanConstraint[];
}

export interface PlannerOutput {
  taskId: string;
  refinedPlan: RefinedPlan;
  researchResults?: ResearchResult[];
  confidence: number;
  suggestedOptimizations: string[];
}

export interface DraftPlan {
  taskId: string;
  steps: PlanStep[];
  dependencies: Record<string, string[]>;
  estimatedTime: number;
  resources: string[];
}

export interface PlanStep {
  id: string;
  description: string;
  subagentType: string;
  expectedOutput: string;
  dependencies: string[];
  priority: number;
}

export interface RefinedPlan {
  steps: RefinedStep[];
  executionOrder: string[];
  totalEstimatedTime: number;
  riskLevel: "low" | "medium" | "high";
  checkpoints: Checkpoint[];
}

export interface RefinedStep {
  id: string;
  description: string;
  subagentType: string;
  expectedOutput: string;
  dependencies: string[];
  priority: number;
  validationCriteria: string[];
  rollbackStrategy?: string;
}

export interface Checkpoint {
  stepId: string;
  validationRequired: string[];
  continueOnFailure: boolean;
}

export interface PlanConstraint {
  type: "time" | "resource" | "dependency" | "quality";
  value: unknown;
  strict: boolean;
}

export interface ResearchTask {
  id: string;
  query: string;
  areas: string[];
  depth: "surface" | "medium" | "deep";
}

export interface ResearchResult {
  taskId: string;
  findings: string[];
  sources: string[];
  confidence: number;
  recommendations: string[];
}

export interface PlannerMessage {
  type: "PLAN_REQUEST" | "PLAN_RESPONSE" | "RESEARCH_REQUEST" | "RESEARCH_RESPONSE" | "ERROR";
  taskId: string;
  payload: unknown;
  timestamp: number;
}
