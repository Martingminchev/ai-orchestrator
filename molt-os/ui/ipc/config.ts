import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { IPCChannel } from "../electron.d.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultConfig = {
  apiKeys: {
    kimi: "",
  },
  paths: {
    workspace: "./workspace",
    context: "./context",
    output: "./output",
  },
  context: {
    maxFiles: 100,
    maxTokens: 100000,
    includePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.json"],
    excludePatterns: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
  },
  workers: {
    defaultModel: "kimi",
    maxConcurrent: 3,
    timeout: 300000,
  },
};

export function registerConfigHandlers(): void {
  ipcMain.handle(IPCChannel.GET_CONFIG, async () => {
    try {
      const configPath = path.join(__dirname, "../../config.json");

      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(configData);
      }

      return defaultConfig;
    } catch (error) {
      console.error("Error reading config:", error);
      return defaultConfig;
    }
  });

  ipcMain.handle(IPCChannel.SAVE_CONFIG, async (_, config: typeof defaultConfig) => {
    try {
      const configPath = path.join(__dirname, "../../config.json");
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (error) {
      console.error("Error saving config:", error);
      return { success: false, error: String(error) };
    }
  });
}
