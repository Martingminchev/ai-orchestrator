import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig(configPath?: string) {
  const { loadConfig: _loadConfig } = await import("../../src/config/load.js");
  return _loadConfig(configPath);
}

async function getDefaultConfig() {
  const { getDefaultConfig: _getDefaultConfig } = await import("../../src/config/defaults.js");
  return _getDefaultConfig();
}

describe("Config System", () => {
  const testDir = path.join(process.cwd(), ".test-molt");
  const testConfigPath = path.join(testDir, "config.json5");

  beforeEach(() => {
    process.env.MOLT_DIR = testDir;
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir, { recursive: true });
    }
  });

  describe("getDefaultConfig", () => {
    it("should return default configuration", async () => {
      const config = await getDefaultConfig();

      expect(config).toBeDefined();
      expect(config.models).toBeDefined();
      expect(config.models.primary).toBeDefined();
      expect(config.models.primary.provider).toBe("kimi");
      expect(config.paths).toBeDefined();
      expect(config.context).toBeDefined();
      expect(config.worker).toBeDefined();
      expect(config.ui).toBeDefined();
    });

    it("should have correct default values", async () => {
      const config = await getDefaultConfig();

      expect(config.models.primary.model).toBe("k2.5");
      expect(config.context.maxContextTokens).toBe(128000);
      expect(config.worker.timeoutMinutes).toBe(30);
      expect(config.worker.maxRetries).toBe(3);
      expect(config.ui.port).toBe(3000);
      expect(config.ui.devMode).toBe(false);
    });
  });

  describe("loadConfig", () => {
    it("should load default config when no config file exists", async () => {
      const config = await loadConfig();

      expect(config).toBeDefined();
      expect(config.models.primary.provider).toBe("kimi");
    });

    it("should throw error for invalid config format", async () => {
      fs.writeFileSync(testConfigPath, "{ invalid json5 }", "utf-8");

      await expect(loadConfig(testConfigPath)).rejects.toThrow();
    });

    it("should load valid config from file", async () => {
      const validConfig = {
        models: {
          primary: {
            provider: "kimi",
            apiKey: "test-key",
            model: "k2.5",
          },
        },
        paths: {
          moltDir: testDir,
          skillsDir: path.join(testDir, "skills"),
          dataDir: path.join(testDir, "data"),
          workDir: path.join(testDir, "work"),
        },
        context: {
          globalFile: path.join(testDir, "global.md"),
          maxContextTokens: 64000,
          enableHotReload: true,
        },
        worker: {
          timeoutMinutes: 60,
          maxRetries: 5,
          enableParallel: true,
        },
        ui: {
          port: 4000,
          devMode: true,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(validConfig), "utf-8");

      const config = await loadConfig(testConfigPath);

      expect(config.models.primary.apiKey).toBe("test-key");
      expect(config.context.maxContextTokens).toBe(64000);
      expect(config.ui.port).toBe(4000);
    });
  });
});
