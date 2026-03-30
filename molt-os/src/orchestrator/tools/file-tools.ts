// File Tools - Tool implementations for file operations
// Used by the file agent for file system operations

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync, renameSync } from "fs";
import { join, dirname, isAbsolute, resolve, basename, extname } from "path";
import { glob } from "glob";
import type { ToolExecutor, ToolInput, ToolOutput, ToolDefinition } from "../../tools/types.js";

class ReadFileTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "read_file",
      description: "Read the contents of a file at the specified path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to read" },
          encoding: { type: "string", description: "File encoding (default: utf-8)" },
        },
        required: ["path"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== "string") {
      errors.push("path is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const path = this.resolvePath(input.path as string);
      
      if (!existsSync(path)) {
        return { success: false, error: `File not found: ${path}` };
      }

      const stats = statSync(path);
      if (stats.isDirectory()) {
        return { success: false, error: `Path is a directory: ${path}` };
      }

      const encoding = (input.encoding as BufferEncoding) || "utf-8";
      const content = readFileSync(path, encoding);

      return {
        success: true,
        result: {
          content,
          path,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class WriteFileTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "write_file",
      description: "Write content to a file at the specified path. Creates parent directories if needed.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to write" },
          content: { type: "string", description: "Content to write to the file" },
          encoding: { type: "string", description: "File encoding (default: utf-8)" },
        },
        required: ["path", "content"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== "string") {
      errors.push("path is required and must be a string");
    }
    if (typeof input.content !== "string") {
      errors.push("content must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const path = this.resolvePath(input.path as string);
      const dir = dirname(path);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const encoding = (input.encoding as BufferEncoding) || "utf-8";
      writeFileSync(path, input.content as string, encoding);

      return {
        success: true,
        result: { path, bytesWritten: (input.content as string).length },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class ListDirectoryTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "list_directory",
      description: "List the contents of a directory",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the directory (default: current directory)" },
          recursive: { type: "boolean", description: "List recursively (default: false)" },
        },
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const path = input.path ? this.resolvePath(input.path as string) : this.cwd;

      if (!existsSync(path)) {
        return { success: false, error: `Directory not found: ${path}` };
      }

      const stats = statSync(path);
      if (!stats.isDirectory()) {
        return { success: false, error: `Path is not a directory: ${path}` };
      }

      const entries = readdirSync(path).map((name) => {
        const fullPath = join(path, name);
        const entryStats = statSync(fullPath);
        return {
          name,
          path: fullPath,
          type: entryStats.isDirectory() ? "directory" : "file",
          size: entryStats.size,
          modified: entryStats.mtime.toISOString(),
        };
      });

      return {
        success: true,
        result: { path, entries, count: entries.length },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class GlobSearchTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "glob_search",
      description: "Search for files using glob patterns (e.g., **/*.ts, src/**/*.js)",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern to match files" },
          cwd: { type: "string", description: "Directory to search in (default: current directory)" },
        },
        required: ["pattern"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.pattern || typeof input.pattern !== "string") {
      errors.push("pattern is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const searchCwd = input.cwd ? this.resolvePath(input.cwd as string) : this.cwd;
      const pattern = input.pattern as string;

      const files = await glob(pattern, { cwd: searchCwd, absolute: true });

      return {
        success: true,
        result: { pattern, cwd: searchCwd, matches: files, count: files.length },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class DeleteFileTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "delete_file",
      description: "Delete a file at the specified path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to delete" },
        },
        required: ["path"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== "string") {
      errors.push("path is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const path = this.resolvePath(input.path as string);

      if (!existsSync(path)) {
        return { success: false, error: `File not found: ${path}` };
      }

      unlinkSync(path);

      return { success: true, result: { path, deleted: true } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class CopyFileTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "copy_file",
      description: "Copy a file from source to destination",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Source file path" },
          destination: { type: "string", description: "Destination file path" },
        },
        required: ["source", "destination"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.source || typeof input.source !== "string") {
      errors.push("source is required and must be a string");
    }
    if (!input.destination || typeof input.destination !== "string") {
      errors.push("destination is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const source = this.resolvePath(input.source as string);
      const destination = this.resolvePath(input.destination as string);

      if (!existsSync(source)) {
        return { success: false, error: `Source file not found: ${source}` };
      }

      const destDir = dirname(destination);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      copyFileSync(source, destination);

      return { success: true, result: { source, destination, copied: true } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class MoveFileTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "move_file",
      description: "Move a file from source to destination",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Source file path" },
          destination: { type: "string", description: "Destination file path" },
        },
        required: ["source", "destination"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.source || typeof input.source !== "string") {
      errors.push("source is required and must be a string");
    }
    if (!input.destination || typeof input.destination !== "string") {
      errors.push("destination is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const source = this.resolvePath(input.source as string);
      const destination = this.resolvePath(input.destination as string);

      if (!existsSync(source)) {
        return { success: false, error: `Source file not found: ${source}` };
      }

      const destDir = dirname(destination);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      renameSync(source, destination);

      return { success: true, result: { source, destination, moved: true } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

class CreateDirectoryTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "create_directory",
      description: "Create a directory at the specified path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the directory to create" },
        },
        required: ["path"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== "string") {
      errors.push("path is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const path = this.resolvePath(input.path as string);

      if (existsSync(path)) {
        return { success: true, result: { path, created: false, message: "Directory already exists" } };
      }

      mkdirSync(path, { recursive: true });

      return { success: true, result: { path, created: true } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

/**
 * Create all file tools
 */
export function createFileTools(cwd?: string): ToolExecutor[] {
  return [
    new ReadFileTool(cwd),
    new WriteFileTool(cwd),
    new ListDirectoryTool(cwd),
    new GlobSearchTool(cwd),
    new DeleteFileTool(cwd),
    new CopyFileTool(cwd),
    new MoveFileTool(cwd),
    new CreateDirectoryTool(cwd),
  ];
}
