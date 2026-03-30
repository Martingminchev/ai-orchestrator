import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadConfig } from "../config/load.js";
import { saveConfig } from "../config/save.js";
import { getLogger } from "../utils/logger.js";
import { checkForUpdate } from "./update-check.js";
import { Orchestrator, Task } from "../orchestrator/orchestrator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findPackageJson(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find package.json");
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function buildProgram(): Command {
  const program = new Command();
  const pkgPath = findPackageJson();
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  program
    .name("molt-os")
    .description("MOLT-OS - MOLT Orchestrator Terminal Operating System")
    .version(pkg.version);

  program
    .option("--verbose", "enable verbose logging")
    .option("--json", "output as JSON")
    .option("--profile <name>", "use specific profile");

  program
    .command("init")
    .description("Initialize MOLT-OS configuration")
    .action(async () => {
      const logger = getLogger();
      try {
        logger.info("Initializing MOLT-OS configuration...");
        const config = loadConfig();
        logger.info("Configuration loaded successfully", { configPath: config._meta?.configPath });
        console.log("MOLT-OS initialized successfully.");
        console.log("Run 'molt-os status' to check configuration.");
        process.exit(0);
      } catch (error) {
        logger.error("Failed to initialize", { error });
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Check MOLT-OS status")
    .action(async () => {
      const logger = getLogger();
      try {
        const config = loadConfig();
        logger.info("MOLT-OS Status:", {
          models: config.models,
          paths: config.paths,
          context: config.context,
          ui: config.ui,
        });
        console.log("MOLT-OS is running with the following configuration:");
        console.log(JSON.stringify(config, null, 2));
        process.exit(0);
      } catch (error) {
        logger.error("Failed to get status", { error });
        process.exit(1);
      }
    });

  program
    .command("config")
    .description("Manage configuration")
    .addCommand(
      new Command("get")
        .argument("<key>")
        .description("Get config value")
        .action(async (key: string) => {
          const config = loadConfig();
          const value = key
            .split(".")
            .reduce((obj: Record<string, unknown>, k) => obj?.[k], config);
          console.log(JSON.stringify(value, null, 2));
          process.exit(0);
        }),
    )
    .addCommand(
      new Command("set")
        .argument("<key>")
        .argument("<value>")
        .description("Set config value")
        .action(async (key: string, value: string) => {
          const config = loadConfig();
          const keys = key.split(".");
          let current: Record<string, unknown> = config;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
              current[keys[i]] = {};
            }
            current = current[keys[i]] as Record<string, unknown>;
          }
          try {
            current[keys[keys.length - 1]] = JSON.parse(value);
          } catch {
            current[keys[keys.length - 1]] = value;
          }
          saveConfig(config);
          console.log(`Set ${key} to ${value}`);
          process.exit(0);
        }),
    );

  program
    .command("check-update")
    .description("Check for updates")
    .action(async () => {
      await checkForUpdate();
      process.exit(0);
    });

  program
    .command("run <task>")
    .description("Run a task through the orchestrator")
    .option("--json", "output as JSON")
    .option("--verbose", "enable verbose logging")
    .action(async (task: string, options: { json?: boolean; verbose?: boolean }) => {
      const logger = getLogger();
      const config = loadConfig();
      const verbose = options.verbose ?? false;

      if (verbose) {
        logger.info("Running task", { task, config });
      } else {
        logger.info("Running task", { task });
      }

      const orchestrator = new Orchestrator();
      const taskObj: Task = {
        id: generateId(),
        prompt: task,
        context: {
          ...config.context as Record<string, unknown>,
          cwd: process.cwd(),
        },
        createdAt: new Date(),
      };

      const spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      let spinnerIndex = 0;
      let completed = false;

      console.log(`\x1b[36m${spinnerChars[0]}\x1b[0m Executing task: "${task}"`);

      const progressInterval = setInterval(() => {
        if (completed) {
          clearInterval(progressInterval);
          return;
        }
        spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
        const status = orchestrator.getStatus();
        process.stdout.write(`\r\x1b[36m${spinnerChars[spinnerIndex]}\x1b[0m Queued: ${status.queuedTasks} | Active: ${status.activeWorkers}`);
      }, 100);

      try {
        const result = await orchestrator.submitTask(taskObj);
        completed = true;
        clearInterval(progressInterval);
        process.stdout.write("\r" + " ".repeat(50) + "\r");

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.success) {
            console.log("\x1b[32m✓\x1b[0m Task completed successfully");
            if (typeof result.result === "string") {
              console.log(result.result);
            } else if (result.result) {
              console.log(JSON.stringify(result.result, null, 2));
            }
          } else {
            console.log(`\x1b[31m✗\x1b[0m Task failed: ${result.error}`);
            process.exitCode = 1;
          }
        }

        if (verbose) {
          console.log("\nDebug info:", JSON.stringify({
            taskId: result.taskId,
            completedAt: result.completedAt,
            success: result.success
          }, null, 2));
        }
        
        process.exit(0);
      } catch (error) {
        completed = true;
        clearInterval(progressInterval);
        process.stdout.write("\r" + " ".repeat(50) + "\r");
        console.log(`\x1b[31m✗\x1b[0m Error: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });

  return program;
}
