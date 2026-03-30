import fs from "node:fs";
import path from "node:path";

export interface ReadFileOptions {
  encoding?: BufferEncoding;
  fallback?: string;
}

export function readFile(filePath: string, options?: ReadFileOptions): string {
  try {
    return fs.readFileSync(filePath, options?.encoding || "utf-8");
  } catch (error) {
    if (options?.fallback !== undefined) {
      return options.fallback;
    }
    throw error;
  }
}

export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

export function appendFile(filePath: string, content: string): void {
  fs.appendFileSync(filePath, content, "utf-8");
}

export function deleteFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function copyFile(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function listFiles(dirPath: string, recursive = false): string[] {
  const results: string[] = [];

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) {
          traverse(fullPath);
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  traverse(dirPath);
  return results;
}

export function readJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

export function writeJson<T>(filePath: string, data: T, pretty = true): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  fs.writeFileSync(filePath, content, "utf-8");
}
