export interface OrchestratorConfig {
  workerDir: string;
  globalContextPath: string;
  maxRetries: number;
  timeout: number;
}

export interface OrchestratorTask {
  id: string;
  description: string;
  inputPath: string;
  outputPath: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestratorResult {
  success: boolean;
  taskId: string;
  outputPath?: string;
  error?: string;
  validationResults?: ValidationResult[];
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  check: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkerSpawnConfig {
  task: OrchestratorTask;
  globalContext: string;
  workingDir: string;
}

export interface OrchestratorMessage {
  type: "TASK" | "RESULT" | "ERROR" | "PROGRESS";
  taskId: string;
  payload: unknown;
  timestamp: number;
}
