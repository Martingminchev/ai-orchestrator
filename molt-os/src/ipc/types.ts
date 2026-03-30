export enum IpcMessageType {
  TASK_REQUEST = "TASK_REQUEST",
  TASK_RESPONSE = "TASK_RESPONSE",
  PLAN_REQUEST = "PLAN_REQUEST",
  PLAN_RESPONSE = "PLAN_RESPONSE",
  SUBAGENT_START = "SUBAGENT_START",
  SUBAGENT_RESULT = "SUBAGENT_RESULT",
  PROGRESS_UPDATE = "PROGRESS_UPDATE",
  ERROR = "ERROR",
  HEARTBEAT = "HEARTBEAT",
  SHUTDOWN = "SHUTDOWN",
}

export interface IpcMessage<T = unknown> {
  type: IpcMessageType;
  taskId: string;
  payload: T;
  timestamp: number;
  messageId: string;
  source: "orchestrator" | "worker" | "planner" | "subagent";
  target: "orchestrator" | "worker" | "planner" | "subagent";
}

export interface WorkerToOrchestratorMessage {
  type: IpcMessageType;
  taskId: string;
  payload: WorkerToOrchestratorPayload;
  timestamp: number;
  messageId: string;
}

export interface WorkerToOrchestratorPayload {
  status: "started" | "progress" | "completed" | "failed";
  progress?: number;
  resultPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestratorToWorkerMessage {
  type: IpcMessageType;
  taskId: string;
  payload: OrchestratorToWorkerPayload;
  timestamp: number;
  messageId: string;
}

export interface OrchestratorToWorkerPayload {
  task: {
    id: string;
    description: string;
    inputPath: string;
    outputPath: string;
    metadata?: Record<string, unknown>;
  };
  globalContext: string;
  config?: Record<string, unknown>;
}

export interface WorkerToPlannerMessage {
  type: IpcMessageType;
  taskId: string;
  payload: WorkerToPlannerPayload;
  timestamp: number;
  messageId: string;
}

export interface WorkerToPlannerPayload {
  draftPlan: {
    taskId: string;
    steps: PlanStep[];
    dependencies: Record<string, string[]>;
    estimatedTime: number;
    resources: string[];
  };
  context: string;
  constraints?: PlanConstraint[];
}

export interface PlanStep {
  id: string;
  description: string;
  subagentType: string;
  expectedOutput: string;
  dependencies: string[];
  priority: number;
}

export interface PlanConstraint {
  type: "time" | "resource" | "dependency" | "quality";
  value: unknown;
  strict: boolean;
}

export interface PlannerToWorkerMessage {
  type: IpcMessageType;
  taskId: string;
  payload: PlannerToWorkerPayload;
  timestamp: number;
  messageId: string;
}

export interface PlannerToWorkerPayload {
  refinedPlan: RefinedPlan;
  researchResults?: ResearchResult[];
  confidence: number;
  suggestedOptimizations: string[];
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

export interface ResearchResult {
  taskId: string;
  findings: string[];
  sources: string[];
  confidence: number;
  recommendations: string[];
}

export interface IpcChannel {
  send: (message: IpcMessage) => Promise<void>;
  receive: (callback: (message: IpcMessage) => Promise<void>) => void;
  close: () => Promise<void>;
}

export interface IpcTransport {
  workerOrchestrator: IpcChannel;
  workerPlanner: IpcChannel;
}
