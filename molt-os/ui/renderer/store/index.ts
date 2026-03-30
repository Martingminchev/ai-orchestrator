import { create } from "zustand";
import { MoltConfig, Task, SystemStatus } from "../electron.d";

interface UIState {
  activeView: "dashboard" | "tasks" | "context" | "config";
  setView: (view: UIState["activeView"]) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: "dashboard",
  setView: (view) => set({ activeView: view }),
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));

interface TaskState {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  setTasks: (tasks: Task[]) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
    })),
  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    })),
  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),
  setTasks: (tasks) => set({ tasks }),
}));

interface ConfigState {
  config: MoltConfig;
  setConfig: (config: MoltConfig) => void;
  saveConfig: (config: MoltConfig) => Promise<{ success: boolean; error?: string }>;
  status: "idle" | "loading" | "saved" | "error";
  setStatus: (status: ConfigState["status"]) => void;
}

const defaultConfig: MoltConfig = {
  apiKeys: { kimi: "" },
  paths: { workspace: "./workspace", context: "./context", output: "./output" },
  context: { maxFiles: 100, maxTokens: 100000, includePatterns: [], excludePatterns: [] },
  workers: { defaultModel: "kimi", maxConcurrent: 3, timeout: 300000 },
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: defaultConfig,
  status: "idle",
  setConfig: (config) => set({ config }),
  saveConfig: async (config) => {
    set({ status: "loading" });
    try {
      const result = await window.molt.config.save(config);
      if (result.success) {
        set({ status: "saved" });
        return { success: true };
      } else {
        set({ status: "error" });
        return { success: false, error: result.error };
      }
    } catch (error) {
      set({ status: "error" });
      return { success: false, error: String(error) };
    }
  },
  setStatus: (status) => set({ status }),
}));

interface SystemState {
  status: SystemStatus | null;
  setStatus: (status: SystemStatus) => void;
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
  isConnected: true,
  setConnected: (connected) => set({ isConnected: connected }),
}));
