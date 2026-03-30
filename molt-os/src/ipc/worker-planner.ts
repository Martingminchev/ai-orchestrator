import {
  IpcMessage,
  IpcMessageType,
  WorkerToPlannerMessage,
  PlannerToWorkerMessage,
  IpcChannel,
} from "./types";

export class WorkerPlannerIpc implements IpcChannel {
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

  async sendPlanRequest(
    taskId: string,
    draftPlan: WorkerToPlannerMessage["payload"]["draftPlan"],
    context: string,
    constraints?: WorkerToPlannerMessage["payload"]["constraints"],
  ): Promise<void> {
    await this.send({
      type: IpcMessageType.PLAN_REQUEST,
      taskId,
      source: "worker",
      target: "planner",
      payload: { draftPlan, context, constraints },
    });
  }

  async sendResearchRequest(
    taskId: string,
    query: string,
    areas: string[],
    depth: string,
  ): Promise<void> {
    await this.send({
      type: IpcMessageType.RESEARCH_REQUEST,
      taskId,
      source: "worker",
      target: "planner",
      payload: { query, areas, depth },
    });
  }

  async receivePlanResponse(): Promise<PlannerToWorkerMessage["payload"] | null> {
    const planMessage = this.messageQueue.find((m) => m.type === IpcMessageType.PLAN_RESPONSE);
    if (planMessage) {
      return planMessage.payload as PlannerToWorkerMessage["payload"];
    }
    return null;
  }

  async receiveResearchResponse(): Promise<unknown> {
    const researchMessage = this.messageQueue.find(
      (m) => m.type === IpcMessageType.RESEARCH_RESPONSE,
    );
    if (researchMessage) {
      return researchMessage.payload;
    }
    return null;
  }

  async sendError(taskId: string, error: string): Promise<void> {
    await this.send({
      type: IpcMessageType.ERROR,
      taskId,
      source: "worker",
      target: "planner",
      payload: { error },
    });
  }

  static createForWorker(): WorkerPlannerIpc {
    return new WorkerPlannerIpc(process);
  }

  static createForPlanner(plannerProcess: NodeJS.Process): WorkerPlannerIpc {
    return new WorkerPlannerIpc(plannerProcess);
  }
}
