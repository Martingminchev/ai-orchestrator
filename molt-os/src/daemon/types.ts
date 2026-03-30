export interface DaemonConfig {
  name: string;
  scriptPath: string;
  workingDir: string;
  logPath: string;
  pidPath: string;
  interval: number;
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  lastRun?: number;
  error?: string;
}

export interface SchtasksConfig {
  taskName: string;
  taskPath: string;
  trigger: "onstart" | "onlogon" | "daily" | "hourly";
  delay?: string;
  runAsUser?: string;
  runWithHighestPrivilege: boolean;
  workingDirectory?: string;
}

export interface DaemonMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  tasksProcessed: number;
  errors: number;
  lastActivity?: number;
}
