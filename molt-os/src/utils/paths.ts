import path from "node:path";
import process from "node:process";

export function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}

export function getMoltDir(): string {
  return process.env.MOLT_DIR || path.resolve(process.cwd(), ".molt");
}

export function getSkillsDir(): string {
  return path.resolve(getMoltDir(), "skills");
}

export function getDataDir(): string {
  return path.resolve(getMoltDir(), "data");
}

export function getWorkDir(): string {
  return path.resolve(getMoltDir(), "work");
}

export function getGlobalContextFile(): string {
  return path.resolve(getMoltDir(), "global.md");
}

export function ensureDir(dirPath: string): void {
  const fs = require("node:fs");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function resolvePath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.resolve(process.cwd(), relativePath);
}

export function pathExists(filePath: string): boolean {
  const fs = require("node:fs");
  return fs.existsSync(filePath);
}

export function isSubPath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}
