import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import json5 from "json5";
import { MoltConfig, MoltConfigSchema } from "./schema.js";
import { getDefaultConfig } from "./defaults.js";
import { getLogger } from "../utils/logger.js";
import { saveConfig } from "./save.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadConfig(configPath?: string): MoltConfig {
  const logger = getLogger();

  const moltDir = process.env.MOLT_DIR || ".molt";
  const configFilePath = configPath || path.resolve(moltDir, "config.json5");

  if (!fs.existsSync(configFilePath)) {
    logger.info("Config file not found, creating default config", { configPath: configFilePath });
    const defaultConfig = getDefaultConfig();
    saveConfig(defaultConfig, configFilePath);
    return defaultConfig;
  }

  try {
    const content = fs.readFileSync(configFilePath, "utf-8");
    const rawConfig = json5.parse(content);

    const result = MoltConfigSchema.safeParse(rawConfig);

    if (!result.success) {
      logger.error("Invalid config format", { errors: result.error.format() });
      throw new Error(`Invalid config format: ${result.error.message}`);
    }

    logger.info("Config loaded successfully", { configPath: configFilePath });
    return result.data;
  } catch (error) {
    logger.error("Failed to load config", { error });
    throw error;
  }
}

export function resolveConfigPath(): string {
  const moltDir = process.env.MOLT_DIR || ".molt";
  return path.resolve(moltDir, "config.json5");
}
