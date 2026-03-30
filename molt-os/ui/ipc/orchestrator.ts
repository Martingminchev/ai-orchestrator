import { ipcMain, BrowserWindow } from "electron";
import { IPCChannel } from "../electron.d.js";

export function registerOrchestratorHandlers(): void {
  ipcMain.handle(IPCChannel.GET_STATUS, async () => {
    return {
      version: "1.0.0",
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      status: "running",
      agents: {
        planner: { status: "idle", load: 0 },
        coder: { status: "idle", load: 0 },
        tester: { status: "idle", load: 0 },
        reporter: { status: "idle", load: 0 },
      },
    };
  });

  ipcMain.handle(IPCChannel.RESTART_ORCHESTRATOR, async () => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send("molt:restarting");
    });
    return { success: true };
  });
}
