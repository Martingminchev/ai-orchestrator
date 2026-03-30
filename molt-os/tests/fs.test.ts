import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

async function readFile(filePath: string, options?: { encoding?: string; fallback?: string }) {
  const { readFile: _readFile } = await import("../../src/utils/fs.js");
  return _readFile(filePath, options as Parameters<typeof _readFile>[1]);
}

async function writeFile(filePath: string, content: string) {
  const { writeFile: _writeFile } = await import("../../src/utils/fs.js");
  return _writeFile(filePath, content);
}

async function appendFile(filePath: string, content: string) {
  const { appendFile: _appendFile } = await import("../../src/utils/fs.js");
  return _appendFile(filePath, content);
}

async function deleteFile(filePath: string) {
  const { deleteFile: _deleteFile } = await import("../../src/utils/fs.js");
  return _deleteFile(filePath);
}

async function copyFile(src: string, dest: string) {
  const { copyFile: _copyFile } = await import("../../src/utils/fs.js");
  return _copyFile(src, dest);
}

async function fileExists(filePath: string) {
  const { fileExists: _fileExists } = await import("../../src/utils/fs.js");
  return _fileExists(filePath);
}

async function listFiles(dirPath: string, recursive = false) {
  const { listFiles: _listFiles } = await import("../../src/utils/fs.js");
  return _listFiles(dirPath, recursive);
}

async function readJson<T>(filePath: string) {
  const { readJson: _readJson } = await import("../../src/utils/fs.js");
  return _readJson<T>(filePath);
}

async function writeJson<T>(filePath: string, data: T, pretty = true) {
  const { writeJson: _writeJson } = await import("../../src/utils/fs.js");
  return _writeJson(filePath, data, pretty);
}

describe("File System Utilities", () => {
  const testDir = path.join(process.cwd(), ".test-fs-utils");
  const testFile = path.join(testDir, "test.txt");
  const testJsonFile = path.join(testDir, "test.json");
  const testCopyFile = path.join(testDir, "test-copy.txt");

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe("writeFile and readFile", () => {
    it("should write and read file content", async () => {
      const content = "Hello, World!";
      await writeFile(testFile, content);
      const readContent = await readFile(testFile);
      expect(readContent).toBe(content);
    });

    it("should throw error for non-existent file", async () => {
      const nonExistentFile = path.join(testDir, "non-existent.txt");
      await expect(readFile(nonExistentFile)).rejects.toThrow();
    });

    it("should return fallback for non-existent file when specified", async () => {
      const nonExistentFile = path.join(testDir, "non-existent.txt");
      const result = await readFile(nonExistentFile, { fallback: "default" });
      expect(result).toBe("default");
    });
  });

  describe("appendFile", () => {
    it("should append content to file", async () => {
      await writeFile(testFile, "Hello");
      await appendFile(testFile, ", World!");
      const content = await readFile(testFile);
      expect(content).toBe("Hello, World!");
    });
  });

  describe("deleteFile", () => {
    it("should delete existing file", async () => {
      await writeFile(testFile, "content");
      expect(await fileExists(testFile)).toBe(true);
      await deleteFile(testFile);
      expect(await fileExists(testFile)).toBe(false);
    });

    it("should not throw for non-existent file", async () => {
      const nonExistentFile = path.join(testDir, "non-existent.txt");
      await expect(deleteFile(nonExistentFile)).resolves.not.toThrow();
    });
  });

  describe("copyFile", () => {
    it("should copy file content", async () => {
      await writeFile(testFile, "Original content");
      await copyFile(testFile, testCopyFile);
      const copyContent = await readFile(testCopyFile);
      expect(copyContent).toBe("Original content");
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      await writeFile(testFile, "content");
      expect(await fileExists(testFile)).toBe(true);
    });

    it("should return false for non-existent file", async () => {
      expect(await fileExists(path.join(testDir, "non-existent.txt"))).toBe(false);
    });
  });

  describe("listFiles", () => {
    it("should list files in directory", async () => {
      await writeFile(path.join(testDir, "file1.txt"), "content1");
      await writeFile(path.join(testDir, "file2.txt"), "content2");

      const files = await listFiles(testDir, false);
      expect(files.length).toBe(2);
    });

    it("should list files recursively", async () => {
      fs.mkdirSync(path.join(testDir, "subdir"), { recursive: true });
      await writeFile(path.join(testDir, "file1.txt"), "content1");
      await writeFile(path.join(testDir, "subdir", "file2.txt"), "content2");

      const files = await listFiles(testDir, true);
      expect(files.length).toBe(2);
    });
  });

  describe("readJson and writeJson", () => {
    it("should write and read JSON", async () => {
      const data = { name: "test", value: 123 };
      await writeJson(testJsonFile, data);
      const readData = await readJson<{ name: string; value: number }>(testJsonFile);
      expect(readData).toEqual(data);
    });

    it("should pretty print JSON", async () => {
      const data = { name: "test" };
      await writeJson(testJsonFile, data, true);
      const content = fs.readFileSync(testJsonFile, "utf-8");
      expect(content).toContain("\n");
    });
  });
});
