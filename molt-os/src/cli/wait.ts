import { getLogger } from "../utils/logger.js";

export function waitForever(): void {
  const logger = getLogger();
  logger.info("MOLT-OS daemon is running. Press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down...");
    process.exit(0);
  });

  while (true) {
    // Wait forever - this keeps the daemon running
    const start = Date.now();
    while (Date.now() - start < 60000) {
      // Sleep for 1 minute
    }
  }
}
