import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../utils/dotenv.js";
import { getLogger } from "../utils/logger.js";
import { buildProgram } from "./program.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const logger = getLogger();
  const normalizedArgv = stripWindowsNodeExec(argv);
  loadDotEnv({ quiet: true });

  if (normalizedArgv.includes("--verbose")) {
    logger.settings.minLevel = 4;
  }

  const { buildProgram } = await import("./program.js");
  const program = buildProgram();

  process.on("uncaughtException", (error) => {
    logger.error("[molt-os] Uncaught exception:", error);
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("[molt-os] Unhandled rejection:", reason);
  });

  await program.parseAsync(normalizedArgv);
}

function stripWindowsNodeExec(argv: string[]): string[] {
  if (process.platform !== "win32") {
    return argv;
  }
  const stripControlChars = (value: string): string => {
    let out = "";
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code >= 32 && code !== 127) {
        out += value[i];
      }
    }
    return out;
  };
  const normalizeArg = (value: string): string =>
    stripControlChars(value)
      .replace(/^['"]+|['"]+$/g, "")
      .trim();
  const normalizeCandidate = (value: string): string =>
    normalizeArg(value).replace(/^\\\\\?\\/, "");
  const execPath = normalizeCandidate(process.execPath);
  const execPathLower = execPath.toLowerCase();
  const execBase = path.basename(execPath).toLowerCase();
  const isExecPath = (value: string | undefined): boolean => {
    if (!value) {
      return false;
    }
    const normalized = normalizeCandidate(value);
    if (!normalized) {
      return false;
    }
    const lower = normalized.toLowerCase();
    return (
      lower === execPathLower ||
      path.basename(lower) === execBase ||
      lower.endsWith("\\node.exe") ||
      lower.endsWith("/node.exe") ||
      lower.includes("node.exe") ||
      (path.basename(lower) === "node.exe" && fs.existsSync(normalized))
    );
  };
  const filtered = argv.filter((arg, index) => index === 0 || !isExecPath(arg));
  if (filtered.length < 3) {
    return filtered;
  }
  const cleaned = [...filtered];
  if (isExecPath(cleaned[1])) {
    cleaned.splice(1, 1);
  }
  if (isExecPath(cleaned[2])) {
    cleaned.splice(2, 1);
  }
  return cleaned;
}

runCli().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
