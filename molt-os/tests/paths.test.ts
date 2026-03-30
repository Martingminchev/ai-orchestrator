import { describe, it, expect } from "vitest";
import * as path from "node:path";

async function getHomeDir() {
  const { getHomeDir: _getHomeDir } = await import("../../src/utils/paths.js");
  return _getHomeDir();
}

async function getMoltDir() {
  const { getMoltDir: _getMoltDir } = await import("../../src/utils/paths.js");
  return _getMoltDir();
}

async function getSkillsDir() {
  const { getSkillsDir: _getSkillsDir } = await import("../../src/utils/paths.js");
  return _getSkillsDir();
}

async function getDataDir() {
  const { getDataDir: _getDataDir } = await import("../../src/utils/paths.js");
  return _getDataDir();
}

async function getWorkDir() {
  const { getWorkDir: _getWorkDir } = await import("../../src/utils/paths.js");
  return _getWorkDir();
}

async function resolvePath(relativePath: string) {
  const { resolvePath: _resolvePath } = await import("../../src/utils/paths.js");
  return _resolvePath(relativePath);
}

describe("Path Utilities", () => {
  describe("getHomeDir", () => {
    it("should return a string path", async () => {
      const homeDir = await getHomeDir();
      expect(typeof homeDir).toBe("string");
      expect(homeDir.length).toBeGreaterThan(0);
    });
  });

  describe("getMoltDir", () => {
    it("should return default molt dir", async () => {
      const moltDir = await getMoltDir();
      expect(moltDir).toBe(path.resolve(process.cwd(), ".molt"));
    });

    it("should use MOLT_DIR environment variable", async () => {
      process.env.MOLT_DIR = "/custom/path";
      const moltDir = await getMoltDir();
      expect(moltDir).toBe("/custom/path");
      delete process.env.MOLT_DIR;
    });
  });

  describe("getSkillsDir", () => {
    it("should return skills directory within molt dir", async () => {
      const skillsDir = await getSkillsDir();
      expect(skillsDir).toBe(path.resolve(process.cwd(), ".molt", "skills"));
    });
  });

  describe("getDataDir", () => {
    it("should return data directory within molt dir", async () => {
      const dataDir = await getDataDir();
      expect(dataDir).toBe(path.resolve(process.cwd(), ".molt", "data"));
    });
  });

  describe("getWorkDir", () => {
    it("should return work directory within molt dir", async () => {
      const workDir = await getWorkDir();
      expect(workDir).toBe(path.resolve(process.cwd(), ".molt", "work"));
    });
  });

  describe("resolvePath", () => {
    it("should return absolute paths unchanged", async () => {
      const absolutePath = "/absolute/path/to/file";
      const resolved = await resolvePath(absolutePath);
      expect(resolved).toBe(absolutePath);
    });

    it("should resolve relative paths from current directory", async () => {
      const relativePath = "relative/path";
      const resolved = await resolvePath(relativePath);
      expect(resolved).toBe(path.resolve(process.cwd(), relativePath));
    });
  });
});
