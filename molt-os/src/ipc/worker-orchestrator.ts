import {
  IpcMessage,
  IpcMessageType,
  WorkerToOrchestratorMessage,
  OrchestratorToWorkerMessage,
  IpcChannel,
} from "./types";

export class WorkerOrchestratorIpc implements IpcChannel {
  private messageQueue: IpcMessage[] = [];
  private handlers: ((message: IpcMessage) => Promise<void>)[] = [];
  private messageIdCounter = 0;

  constructor(private process: NodeJS.Process) {
    this.setupProcessListeners();
  }

  private setupProcessListeners(): void {
    this.process.on("message", async (message: IpcMessage) => {
      this.messageQueue.push(message);
      for (const handler of this.handlers) {
        await handler(message);
      }
    });
  }

  async send(message: Omit<IpcMessage, "messageId" | "timestamp">): Promise<void> {
    const fullMessage: IpcMessage = {
      ...message,
      messageId: `msg_${++this.messageIdCounter}_${Date.now()}`,
      timestamp: Date.now(),
    };

    if (this.process.send) {
      this.process.send(fullMessage);
    }
  }

  receive(callback: (message: IpcMessage) => Promise<void>): void {
    this.handlers.push(callback);
  }

  async close(): Promise<void> {
    this.handlers = [];
    this.messageQueue = [];
  }

  async sendTaskRequest(
    taskId: string,
    status: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.send({
      type: IpcMessageType.TASK_REQUEST,
      taskId,
      source: "worker",
      target: "orchestrator",
      payload: { status, metadata },
    });
  }

  async sendProgress(
    taskId: string,
    progress: number,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.send({
      type: IpcMessageType.PROGRESS_UPDATE,
      taskId,
      source: "worker",
      target: "orchestrator",
      payload: { progress, details },
    });
  }

  async sendResult(
    taskId: string,
    resultPath: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.send({
      type: IpcMessageType.TASK_RESPONSE,
      taskId,
      source: "worker",
      target: "orchestrator",
      payload: { status: "completed", resultPath, metadata },
    });
  }

  async sendError(taskId: string, error: string): Promise<void> {
    await this.send({
      type: IpcMessageType.ERROR,
      taskId,
      source: "worker",
      target: "orchestrator",
      payload: { error },
    });
  }

  static createForWorker(): WorkerOrchestratorIpc {
    return new WorkerOrchestratorIpc(process);
  }

  static createForOrchestrator(workerProcess: NodeJS.Process): WorkerOrchestratorIpc {
    return new WorkerOrchestratorIpc(workerProcess);
  }
}
