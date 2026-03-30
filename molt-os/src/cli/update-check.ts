import { getLogger } from "../utils/logger.js";
import { loadConfig } from "../config/load.js";

export async function checkForUpdate(): Promise<void> {
  const logger = getLogger();
  const config = loadConfig();

  logger.info("Checking for updates...", {
    currentVersion: "0.1.0",
    updateChannel: "stable",
  });

  console.log("You are running MOLT-OS v0.1.0");
  console.log("No updates available at this time.");
}
