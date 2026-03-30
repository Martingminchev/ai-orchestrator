import { ipcMain, BrowserWindow } from "electron";
import { IPCChannel, Task, TaskConfig } from "../electron.d.js";

const taskStore: Map<string, Task> = new Map();

export function registerTasksHandlers(): void {
  ipcMain.handle(IPCChannel.GET_TASKS, async () => {
    return Array.from(taskStore.values());
  });

  ipcMain.handle(IPCChannel.START_TASK, async (_, taskConfig: TaskConfig) => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const task: Task = {
      id: taskId,
      name: taskConfig.name,
      description: taskConfig.description,
      status: "running",
      progress: 0,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      agent: taskConfig.agent || "auto",
    };

    taskStore.set(taskId, task);
    broadcastTaskUpdate(task);

    simulateTaskProgress(taskId);

    return { taskId, status: "running" };
  });

  ipcMain.handle(IPCChannel.STOP_TASK, async (_, taskId: string) => {
    const task = taskStore.get(taskId);
    if (task) {
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      taskStore.set(taskId, task);
      broadcastTaskUpdate(task);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle(IPCChannel.GET_TASK_LOG, async (_, taskId: string) => {
    const task = taskStore.get(taskId);
    return task?.result || "";
  });
}

function broadcastTaskUpdate(task: Task): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    win.webContents.send("molt:task-updated", task);
  });
}

function simulateTaskProgress(taskId: string): void {
  const task = taskStore.get(taskId);
  if (!task) return;

  const steps = [
    { progress: 20, message: "Analyzing task requirements..." },
    { progress: 40, message: "Loading context files..." },
    { progress: 60, message: "Processing with agent..." },
    { progress: 80, message: "Generating output..." },
    { progress: 100, message: "Task completed!" },
  ];

  let stepIndex = 0;

  const interval = setInterval(() => {
    if (stepIndex >= steps.length) {
      clearInterval(interval);
      return;
    }

    const step = steps[stepIndex];
    task.progress = step.progress;
    task.result = step.message;
    taskStore.set(taskId, task);
    broadcastTaskUpdate(task);

    if (step.progress === 100) {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      taskStore.set(taskId, task);
      broadcastTaskUpdate(task);
    }

    stepIndex++;
  }, 2000);
}
