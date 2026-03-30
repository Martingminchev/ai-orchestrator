import { contextBridge, ipcRenderer } from "electron";
import { IPCChannel, OrchestratorAPI, ConfigAPI, TasksAPI, ContextAPI } from "./electron.d";

const orchestrator: OrchestratorAPI = {
  getStatus: () => ipcRenderer.invoke(IPCChannel.GET_STATUS),
  restart: () => ipcRenderer.invoke(IPCChannel.RESTART_ORCHESTRATOR),
};

const config: ConfigAPI = {
  get: () => ipcRenderer.invoke(IPCChannel.GET_CONFIG),
  save: (config) => ipcRenderer.invoke(IPCChannel.SAVE_CONFIG, config),
};

const tasks: TasksAPI = {
  getAll: () => ipcRenderer.invoke(IPCChannel.GET_TASKS),
  start: (taskConfig) => ipcRenderer.invoke(IPCChannel.START_TASK, taskConfig),
  stop: (taskId) => ipcRenderer.invoke(IPCChannel.STOP_TASK, taskId),
  getLog: (taskId) => ipcRenderer.invoke(IPCChannel.GET_TASK_LOG, taskId),
};

const context: ContextAPI = {
  getFiles: () => ipcRenderer.invoke(IPCChannel.GET_CONTEXT_FILES),
  read: (filename) => ipcRenderer.invoke(IPCChannel.READ_CONTEXT_FILE, filename),
  save: (filename, content) => ipcRenderer.invoke(IPCChannel.SAVE_CONTEXT_FILE, filename, content),
};

contextBridge.exposeInMainWorld("molt", {
  orchestrator,
  config,
  tasks,
  context,
});

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,
  env: process.env,
});
