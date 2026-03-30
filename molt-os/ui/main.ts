import { app, BrowserWindow, ipcMain, nativeTheme, Menu, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { IPCChannel } from "./electron.d.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let orchestratorProcess: any = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: "#0a0a0f",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0a0f",
      symbolColor: "#ffffff",
      height: 40,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
    },
    icon: path.join(__dirname, "../resources/icon.png"),
    show: false,
  });

  const startUrl = process.env.ELECTRON_START_URL || path.join(__dirname, "../renderer/index.html");

  await mainWindow.loadURL(startUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "MOLT-OS",
      submenu: [
        { label: "About MOLT-OS", click: () => showAbout() },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
  ]);

  Menu.setApplicationMenu(menu);
}

function showAbout(): void {
  const { dialog } = require("electron");
  dialog.showMessageBox(mainWindow!, {
    type: "info",
    title: "About MOLT-OS",
    message: "MOLT-OS",
    detail:
      "Multi-Orchestrator LLM Task Operating System\n\nVersion 1.0.0\n\nA modern, modular LLM orchestration system built with Electron.",
  });
}

async function startOrchestrator(): Promise<void> {
  try {
    const { spawn } = require("child_process");
    const orchestratorPath = path.join(__dirname, "../dist/orchestrator/index.js");

    orchestratorProcess = spawn("node", [orchestratorPath], {
      cwd: path.join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"],
    });

    orchestratorProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`Orchestrator: ${data}`);
    });

    orchestratorProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`Orchestrator Error: ${data}`);
    });

    orchestratorProcess.on("error", (error: Error) => {
      console.error("Failed to start orchestrator:", error);
    });
  } catch (error) {
    console.error("Error starting orchestrator:", error);
  }
}

ipcMain.handle(IPCChannel.GET_STATUS, async () => {
  return {
    version: "1.0.0",
    platform: process.platform,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    status: "running",
  };
});

ipcMain.handle(IPCChannel.GET_CONFIG, async () => {
  try {
    const fs = await import("fs");
    const configPath = path.join(__dirname, "../config.json");
    const configData = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(configData);
  } catch {
    return null;
  }
});

ipcMain.handle(IPCChannel.SAVE_CONFIG, async (_, config: any) => {
  try {
    const fs = await import("fs");
    const configPath = path.join(__dirname, "../config.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPCChannel.GET_TASKS, async () => {
  return [];
});

ipcMain.handle(IPCChannel.START_TASK, async (_, taskConfig: any) => {
  return { taskId: `task-${Date.now()}`, status: "pending" };
});

ipcMain.handle(IPCChannel.GET_CONTEXT_FILES, async () => {
  try {
    const fs = await import("fs");
    const contextPath = path.join(__dirname, "../context");
    const files = fs.readdirSync(contextPath);
    return files.filter((f: string) => f.endsWith(".json"));
  } catch {
    return [];
  }
});

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  await createWindow();
  await startOrchestrator();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (orchestratorProcess) {
    orchestratorProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (orchestratorProcess) {
    orchestratorProcess.kill();
  }
});
