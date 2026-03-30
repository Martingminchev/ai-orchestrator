import { EventEmitter } from "events";
import { createTaskExecutionEngine, TaskExecutionEngine } from "./task-executor.js";

export interface OrchestratorConfig {
  workerDir?: string;
  maxRetries?: number;
  maxWorkers?: number;
  taskTimeout?: number;
  retryDelay?: number;
}

export interface OrchestratorStatus {
  activeWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export interface Task {
  id: string;
  prompt: string;
  context?: Record<string, unknown>;
  priority?: number;
  createdAt: Date;
  retryCount?: number;
  maxRetries?: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  completedAt: Date;
}

export interface TaskStatus {
  taskId: string;
  state: "pending" | "in_progress" | "completed" | "failed";
  workerId?: string;
  progress?: number;
  retryCount?: number;
  lastError?: string;
}

interface WorkerProcess {
  id: string;
  pid?: number;
  taskId?: string;
  startedAt: Date;
  status: "idle" | "busy" | "failed";
}

interface PendingTask {
  task: Task;
  resolve: (result: TaskResult) => void;
  reject: (error: Error) => void;
}

export class Orchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private taskQueue: Task[] = [];
  private activeWorkers: Map<string, WorkerProcess> = new Map();
  private taskPromises: Map<
    string,
    { resolve: (result: TaskResult) => void; reject: (error: Error) => void }
  > = new Map();
  private taskResults: Map<string, TaskResult> = new Map();
  private taskStatus: Map<string, TaskStatus> = new Map();
  private completedTasks: number = 0;
  private failedTasks: number = 0;
  private workerCounter: number = 0;

  constructor(config?: OrchestratorConfig) {
    super();
    this.config = {
      maxRetries: 3,
      maxWorkers: 5,
      taskTimeout: 300000,
      retryDelay: 1000,
      ...config,
    };
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  getStatus(): OrchestratorStatus {
    return {
      activeWorkers: this.activeWorkers.size,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
    };
  }

  addTask(task: Task): void {
    task.createdAt = new Date();
    task.retryCount = 0;
    task.maxRetries = task.maxRetries ?? this.config.maxRetries ?? 3;

    const status: TaskStatus = {
      taskId: task.id,
      state: "pending",
    };
    this.taskStatus.set(task.id, status);

    if (task.priority && task.priority > 0) {
      const highPriorityIndex = this.taskQueue.findIndex(
        (t) => (t.priority ?? 0) < (task.priority ?? 0),
      );
      if (highPriorityIndex === -1) {
        this.taskQueue.push(task);
      } else {
        this.taskQueue.splice(highPriorityIndex, 0, task);
      }
    } else {
      this.taskQueue.push(task);
    }

    this.processQueue();
  }

  getNextTask(): Task | null {
    if (this.taskQueue.length === 0) {
      return null;
    }
    return this.taskQueue.shift() ?? null;
  }

  async submitTask(task: Task): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      this.addTask(task);
      this.taskPromises.set(task.id, { resolve, reject });
    });
  }

  getTaskStatus(taskId: string): TaskStatus | null {
    return this.taskStatus.get(taskId) ?? null;
  }

  async spawnWorker(workerId: string, task: Task): Promise<void> {
    const worker: WorkerProcess = {
      id: workerId,
      taskId: task.id,
      startedAt: new Date(),
      status: "busy",
    };
    this.activeWorkers.set(workerId, worker);

    const status = this.taskStatus.get(task.id);
    if (status) {
      status.state = "in_progress";
      status.workerId = workerId;
      this.taskStatus.set(task.id, status);
    }

    this.emit("worker:spawned", { workerId, taskId: task.id });

    try {
      await this.executeTaskWithTimeout(workerId, task);
    } catch (error) {
      await this.handleTaskError(workerId, task, error as Error);
    }
  }

  workerCompleted(workerId: string, result: TaskResult): void {
    const worker = this.activeWorkers.get(workerId);
    if (worker) {
      worker.status = "idle";
      worker.taskId = undefined;
    }

    this.taskResults.set(result.taskId, result);

    const status = this.taskStatus.get(result.taskId);
    if (status) {
      status.state = result.success ? "completed" : "failed";
      status.progress = result.success ? 100 : undefined;
      this.taskStatus.set(result.taskId, status);
    }

    if (result.success) {
      this.completedTasks++;
      this.emit("task:completed", result);
    }

    const pendingTask = this.taskPromises.get(result.taskId);
    if (pendingTask) {
      pendingTask.resolve(result);
      this.taskPromises.delete(result.taskId);
    }

    this.activeWorkers.delete(workerId);
    this.processQueue();
  }

  workerFailed(workerId: string, error: Error): void {
    const worker = this.activeWorkers.get(workerId);
    if (worker) {
      worker.status = "failed";
    }

    this.emit("worker:failed", { workerId, error: error.message });
    this.activeWorkers.delete(workerId);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeWorkers.size < (this.config.maxWorkers ?? 5)) {
      const task = this.getNextTask();
      if (!task) break;

      const workerId = `worker-${++this.workerCounter}`;
      this.spawnWorker(workerId, task).catch((error) => {
        console.error(`Worker ${workerId} failed:`, error);
      });
    }
  }

  private async executeTaskWithTimeout(workerId: string, task: Task): Promise<void> {
    const timeout = this.config.taskTimeout ?? 300000;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${timeout}ms`));
      }, timeout);
    });

    const executePromise = this.executeTask(workerId, task);

    await Promise.race([executePromise, timeoutPromise]);
  }

  private async executeTask(workerId: string, task: Task): Promise<void> {
    try {
      const result = await this.executeTaskWithLLM(task);
      this.workerCompleted(workerId, result);
    } catch (error) {
      throw error;
    }
  }

  private executionEngine: TaskExecutionEngine | null = null;

  private getExecutionEngine(): TaskExecutionEngine {
    if (!this.executionEngine) {
      this.executionEngine = createTaskExecutionEngine(undefined, {
        maxIterations: 50,
        timeout: this.config.taskTimeout,
      });
    }
    return this.executionEngine;
  }

  private async executeTaskWithLLM(task: Task): Promise<TaskResult> {
    try {
      const engine = this.getExecutionEngine();
      return await engine.execute(task);
    } catch (error) {
      // Fallback to simple execution if LLM is not available
      console.warn("LLM execution failed, using fallback:", error);
      return this.fallbackExecution(task);
    }
  }

  private async fallbackExecution(task: Task): Promise<TaskResult> {
    // Simple fallback when LLM is not available
    return {
      taskId: task.id,
      success: false,
      error: "LLM execution not available. Please configure KIMI_API_KEY.",
      completedAt: new Date(),
    };
  }

  private async handleTaskError(workerId: string, task: Task, error: Error): Promise<void> {
    const status = this.taskStatus.get(task.id);
    if (status) {
      status.lastError = error.message;
    }

    if ((task.retryCount ?? 0) < (task.maxRetries ?? this.config.maxRetries ?? 3)) {
      task.retryCount = (task.retryCount ?? 0) + 1;

      const status = this.taskStatus.get(task.id);
      if (status) {
        status.retryCount = task.retryCount;
        status.state = "pending";
        this.taskStatus.set(task.id, status);
      }

      this.emit("task:retry", {
        taskId: task.id,
        retryCount: task.retryCount,
        error: error.message,
      });

      const retryDelay = this.config.retryDelay ?? 1000;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      this.addTask(task);
    } else {
      this.failedTasks++;

      const result: TaskResult = {
        taskId: task.id,
        success: false,
        error: `Max retries exceeded: ${error.message}`,
        completedAt: new Date(),
      };

      this.taskResults.set(task.id, result);

      const status = this.taskStatus.get(task.id);
      if (status) {
        status.state = "failed";
        status.lastError = error.message;
        this.taskStatus.set(task.id, status);
      }

      this.emit("task:failed", result);

      const pendingTask = this.taskPromises.get(task.id);
      if (pendingTask) {
        pendingTask.reject(error);
        this.taskPromises.delete(task.id);
      }
    }

    this.activeWorkers.delete(workerId);
  }
}
