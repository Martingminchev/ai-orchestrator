import path from "node:path";
import { MoltConfig } from "./schema.js";

export function getDefaultConfig(): MoltConfig {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  const moltDir = path.resolve(process.cwd(), ".molt");

  return {
    models: {
      primary: {
        provider: "kimi",
        apiKey: process.env.KIMI_API_KEY || "",
        model: "k2.5",
      },
      fallback: undefined,
    },
    paths: {
      moltDir,
      skillsDir: path.resolve(moltDir, "skills"),
      dataDir: path.resolve(moltDir, "data"),
      workDir: path.resolve(moltDir, "work"),
    },
    context: {
      globalFile: path.resolve(moltDir, "global.md"),
      maxContextTokens: 128000,
      enableHotReload: true,
    },
    worker: {
      timeoutMinutes: 30,
      maxRetries: 3,
      enableParallel: true,
    },
    ui: {
      port: 3000,
      devMode: process.env.NODE_ENV === "development",
    },
  };
}

export function getDefaultApiConfig(): Partial<MoltConfig> {
  return {
    models: {
      primary: {
        provider: "kimi",
        apiKey: process.env.KIMI_API_KEY || "",
        model: "k2.5",
      },
      fallback: undefined,
    },
  };
}
