export interface WorkerConfig {
  plannerUrl: string;
  subagentTimeout: number;
  maxParallelSubagents: number;
  contextDir: string;
}

export interface WorkerTask {
  id: string;
  description: string;
  inputPath: string;
  outputPath: string;
  globalContext: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerResult {
  success: boolean;
  taskId: string;
  subagentResults: SubagentResult[];
  outputPath?: string;
  error?: string;
  validationResults?: ValidationResult[];
}

export interface SubagentResult {
  subagentId: string;
  success: boolean;
  outputPath?: string;
  error?: string;
  validationResults?: ValidationResult[];
}

export interface ValidationResult {
  passed: boolean;
  check: string;
  message: string;
  details?: Record<string, unknown>;
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

export interface SubagentConfig {
  id: string;
  type: string;
  task: string;
  contextFiles: ContextFile[];
  workingDir: string;
}

export interface ContextFile {
  path: string;
  content: string;
  priority: number;
}

export interface WorkerMessage {
  type: "TASK" | "PLAN" | "SUBAGENT_START" | "SUBAGENT_RESULT" | "RESULT" | "ERROR" | "PROGRESS";
  taskId: string;
  payload: unknown;
  timestamp: number;
}
