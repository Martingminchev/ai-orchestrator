import { exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SchtasksConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createSchtasksTask(config: SchtasksConfig): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const command = buildSchtasksCreateCommand(config);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`schtasks failed: ${stderr}`));
        return;
      }
      resolve(true);
    });
  });
}

function buildSchtasksCreateCommand(config: SchtasksConfig): string {
  const parts: string[] = ["schtasks", "/Create"];

  parts.push(`/TN "${config.taskName}"`);

  let triggerArg = "";
  switch (config.trigger) {
    case "onstart":
      triggerArg = "/SC ONSTART";
      break;
    case "onlogon":
      triggerArg = "/SC ONLOGON";
      break;
    case "daily":
      triggerArg = "/SC DAILY";
      break;
    case "hourly":
      triggerArg = "/SC HOURLY";
      break;
    default:
      triggerArg = "/SC ONSTART";
  }

  if (config.delay) {
    triggerArg += ` /DELAY ${config.delay}`;
  }

  parts.push(triggerArg);

  const taskPath = path.isAbsolute(config.taskPath)
    ? config.taskPath
    : path.join(process.cwd(), config.taskPath);

  parts.push(`/TR "\"${taskPath.replace(/"/g, '\\"')}"\"`);

  if (config.runAsUser) {
    parts.push(`/RU "${config.runAsUser}"`);
  }

  if (config.runWithHighestPrivilege) {
    parts.push("/RL HIGHEST");
  }

  parts.push("/F");

  return parts.join(" ");
}

export async function deleteSchtasksTask(taskName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`schtasks /Delete /TN "${taskName}" /F`, (error, stdout, stderr) => {
      if (error && !stderr.includes("does not exist")) {
        reject(new Error(`schtasks delete failed: ${stderr}`));
        return;
      }
      resolve(true);
    });
  });
}

export async function querySchtasksTask(taskName: string): Promise<{
  exists: boolean;
  nextRunTime?: string;
  status?: string;
  lastRunTime?: string;
} | null> {
  return new Promise((resolve, reject) => {
    exec(`schtasks /Query /TN "${taskName}" /FO LIST /V`, (error, stdout, stderr) => {
      if (error) {
        if (stderr.includes("does not exist")) {
          resolve(null);
          return;
        }
        reject(new Error(`schtasks query failed: ${stderr}`));
        return;
      }

      const lines = stdout.split("\n");
      const result: {
        exists: boolean;
        nextRunTime?: string;
        status?: string;
        lastRunTime?: string;
      } = { exists: true };

      for (const line of lines) {
        if (line.includes("Next Run Time:")) {
          result.nextRunTime = line.split(":")[1].trim();
        } else if (line.includes("Status:")) {
          result.status = line.split(":")[1].trim();
        } else if (line.includes("Last Run Time:")) {
          result.lastRunTime = line.split(":")[1].trim();
        }
      }

      resolve(result);
    });
  });
}

export async function runSchtasksTaskNow(taskName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`schtasks /Run /TN "${taskName}" /I`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`schtasks run failed: ${stderr}`));
        return;
      }
      resolve(true);
    });
  });
}

export async function endSchtasksTask(taskName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`schtasks /End /TN "${taskName}"`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`schtasks end failed: ${stderr}`));
        return;
      }
      resolve(true);
    });
  });
}

export async function changeSchtasksTask(
  taskName: string,
  changes: Partial<SchtasksConfig>,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts: string[] = ["schtasks", "/Change"];
    parts.push(`/TN "${taskName}"`);

    if (changes.runAsUser) {
      parts.push(`/RU "${changes.runAsUser}"`);
    }

    if (changes.runWithHighestPrivilege) {
      parts.push("/RL HIGHEST");
    }

    const command = parts.join(" ");

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`schtasks change failed: ${stderr}`));
        return;
      }
      resolve(true);
    });
  });
}

export function getDefaultMoltOsSchtasksConfig(): SchtasksConfig {
  return {
    taskName: "MOLT-OS Daemon",
    taskPath: path.join(__dirname, "daemon-main.js"),
    trigger: "onstart",
    delay: "0005",
    runWithHighestPrivilege: true,
  };
}
