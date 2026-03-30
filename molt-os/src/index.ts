import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type RunMode = "cli" | "electron" | "daemon";

export interface RuntimeInfo {
  mode: RunMode;
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  cwd: string;
  isDev: boolean;
}

let cachedRuntimeInfo: RuntimeInfo | null = null;

export function detectRunMode(): RunMode {
  const argv = process.argv;
  if (argv.includes("--daemon") || argv.includes("daemon")) {
    return "daemon";
  }
  if (process.env.ELECTRON_MODE === "true" || process.env.ELECTRON_START_URL) {
    return "electron";
  }
  return "cli";
}

export function getRuntimeInfo(): RuntimeInfo {
  if (cachedRuntimeInfo) {
    return cachedRuntimeInfo;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));

  const isDev =
    !fs.existsSync(path.join(__dirname, "..", "dist")) || process.env.NODE_ENV === "development";

  cachedRuntimeInfo = {
    mode: detectRunMode(),
    version: pkg.version,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    isDev,
  };

  return cachedRuntimeInfo;
}

export async function startCli(): Promise<void> {
  const { buildProgram } = await import("./cli/program.js");
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

export async function startElectron(): Promise<void> {
  const { spawn } = await import("node:child_process");
  const electronPath = path.join(__dirname, "..", "ui", "main.js");

  const child = spawn("electron", [electronPath], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, ELECTRON_MODE: "true" },
  });

  child.on("error", (error) => {
    console.error("Failed to start Electron:", error);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}

export async function startDaemon(): Promise<void> {
  const { waitForever } = await import("./cli/wait.js");
  waitForever();
}

export async function main(): Promise<void> {
  const info = getRuntimeInfo();

  console.log(`MOLT-OS v${info.version}`);
  console.log(`Mode: ${info.mode}`);
  console.log(`Platform: ${info.platform} (${info.arch})`);
  console.log(`Node: ${info.nodeVersion}`);
  console.log("");

  switch (info.mode) {
    case "cli":
      await startCli();
      break;
    case "electron":
      await startElectron();
      break;
    case "daemon":
      await startDaemon();
      break;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export * from "./config/schema.js";
export * from "./config/types.js";
export * from "./config/load.js";
export * from "./config/save.js";
export * from "./config/defaults.js";
export * from "./models/kimi.js";
export * from "./models/types.js";
export * from "./utils/logger.js";
export * from "./utils/paths.js";
export * from "./utils/fs.js";
export * from "./utils/dotenv.js";
export * from "./cli/program.js";
export * from "./cli/deps.js";
export * from "./cli/prompt.js";
