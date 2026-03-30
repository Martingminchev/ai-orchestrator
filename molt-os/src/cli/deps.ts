import { KimiClient } from "../models/kimi.js";
import { loadConfig } from "../config/load.js";
import { getLogger } from "../utils/logger.js";

export type MoltOsDeps = {
  kimiClient: KimiClient;
};

export function createDefaultDeps(): MoltOsDeps {
  const logger = getLogger();
  const config = loadConfig();

  const kimiClient = new KimiClient({
    apiKey: config.models.primary.apiKey,
    model: config.models.primary.model,
    timeout: config.worker.timeoutMinutes * 60 * 1000,
  });

  return {
    kimiClient,
  };
}

export { loadConfig };
