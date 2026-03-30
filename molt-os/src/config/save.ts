import fs from "node:fs";
import path from "node:path";
import json5 from "json5";
import { MoltConfig } from "./schema.js";
import { resolveConfigPath, loadConfig } from "./load.js";
import { getLogger } from "../utils/logger.js";

export function saveConfig(config: MoltConfig, configPath?: string): void {
  const logger = getLogger();
  const resolvedPath = configPath || resolveConfigPath();

  const configDir = path.dirname(resolvedPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  try {
    const content = json5.stringify(config, null, 2);
    fs.writeFileSync(resolvedPath, content, "utf-8");
    logger.info("Config saved successfully", { configPath: resolvedPath });
  } catch (error) {
    logger.error("Failed to save config", { error });
    throw error;
  }
}

export function updateConfig(updates: Partial<MoltConfig>, configPath?: string): MoltConfig {
  const currentConfig = loadConfig(configPath);
  const mergedConfig = { ...currentConfig, ...updates };
  saveConfig(mergedConfig, configPath);
  return mergedConfig;
}
