import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadConfig } from "../config/load.ts";
import { saveConfig } from "../config/save.ts";
import { getLogger } from "../utils/logger.ts";
import { checkForUpdate } from "./update-check.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildProgram(): Command {
  const program = new Command();
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8"),
  );

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
        console.log("MOLT-OS is already initialized. Run molt-os status to check configuration.");
      } catch (error) {
        logger.error("Failed to initialize", { error });
        throw error;
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
      } catch (error) {
        logger.error("Failed to get status", { error });
        throw error;
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
        }),
    );

  program
    .command("check-update")
    .description("Check for updates")
    .action(async () => {
      await checkForUpdate();
    });

  program
    .command("run")
    .description("Run a task")
    .argument("<task>")
    .action(async (task: string) => {
      const logger = getLogger();
      logger.info("Running task", { task });
      console.log(`Task "${task}" would be executed here.`);
    });

  return program;
}

export async function runCli(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}
