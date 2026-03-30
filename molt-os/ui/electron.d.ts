export const IPCChannel = {
  GET_STATUS: "molt:status",
  RESTART_ORCHESTRATOR: "molt:restart",
  GET_CONFIG: "molt:config:get",
  SAVE_CONFIG: "molt:config:save",
  GET_TASKS: "molt:tasks",
  START_TASK: "molt:start-task",
  STOP_TASK: "molt:stop-task",
  GET_TASK_LOG: "molt:task-log",
  GET_CONTEXT_FILES: "molt:context:files",
  READ_CONTEXT_FILE: "molt:context:read",
  SAVE_CONTEXT_FILE: "molt:context:save",
} as const;

export interface OrchestratorAPI {
  getStatus: () => Promise<SystemStatus>;
  restart: () => Promise<void>;
}

export interface ConfigAPI {
  get: () => Promise<MoltConfig | null>;
  save: (config: MoltConfig) => Promise<{ success: boolean; error?: string }>;
}

export interface TasksAPI {
  getAll: () => Promise<Task[]>;
  start: (taskConfig: TaskConfig) => Promise<{ taskId: string; status: string }>;
  stop: (taskId: string) => Promise<{ success: boolean }>;
  getLog: (taskId: string) => Promise<string>;
}

export interface ContextAPI {
  getFiles: () => Promise<string[]>;
  read: (filename: string) => Promise<ContextFile | null>;
  save: (filename: string, content: ContextContent) => Promise<{ success: boolean }>;
}

export interface SystemStatus {
  version: string;
  platform: string;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  status: string;
}

export interface MoltConfig {
  apiKeys: {
    kimi: string;
  };
  paths: {
    workspace: string;
    context: string;
    output: string;
  };
  context: {
    maxFiles: number;
    maxTokens: number;
    includePatterns: string[];
    excludePatterns: string[];
  };
  workers: {
    defaultModel: string;
    maxConcurrent: number;
    timeout: number;
  };
}

export interface Task {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  agent?: string;
  result?: string;
  error?: string;
}

export interface TaskConfig {
  name: string;
  description: string;
  agent?: string;
  priority?: "low" | "normal" | "high";
  maxDuration?: number;
}

export interface ContextFile {
  filename: string;
  path: string;
  content: ContextContent;
  lastModified: string;
}

export interface ContextContent {
  files: ContextItem[];
  summary: string;
}

export interface ContextItem {
  path: string;
  type: "file" | "directory";
  size: number;
  children?: ContextItem[];
}

declare global {
  interface Window {
    molt: {
      orchestrator: OrchestratorAPI;
      config: ConfigAPI;
      tasks: TasksAPI;
      context: ContextAPI;
    };
    api: {
      platform: string;
      env: Record<string, string>;
    };
  }
}
