import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  unlinkSync,
  copyFileSync,
  renameSync,
  statSync,
} from "fs";
import { join, dirname, isAbsolute, relative } from "path";
import { glob } from "glob";
import { BaseAgent } from "../base.js";
import type { AgentTask, AgentResult } from "../types.js";
import {
  ReadFileSchema,
  WriteFileSchema,
  MoveFileSchema,
  DeleteFileSchema,
  ListDirectorySchema,
  SearchFilesSchema,
  GlobSchema,
  CreateDirectorySchema,
  CopyFileSchema,
} from "./tools.js";

const DEFAULT_CONFIG = {
  name: "File Agent",
  type: "file" as const,
  description:
    "Handles file system operations including reading, writing, moving, deleting, and organizing files",
  capabilities: [
    "Read files with various encodings",
    "Write files with automatic directory creation",
    "Move and rename files safely",
    "Delete files with safety checks",
    "List directory contents with filtering",
    "Search files using glob patterns",
    "Create directory structures",
    "Copy files preserving structure",
  ],
  maxIterations: 50,
};

export class FileAgent extends BaseAgent {
  constructor() {
    super(DEFAULT_CONFIG);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.addSystemMessage(this.createSystemMessage());

    if (task.context?.cwd) {
      this.addSystemMessage(`Working directory: ${task.context.cwd}`);
    }

    this.addUserMessage(task.prompt);

    const result = await this.processTask(task);
    return result;
  }

  private async processTask(task: AgentTask): Promise<AgentResult> {
    const prompt = task.prompt.toLowerCase();

    try {
      if (prompt.includes("read")) {
        return await this.handleRead(task);
      } else if (prompt.includes("write") || prompt.includes("create")) {
        return await this.handleWrite(task);
      } else if (prompt.includes("move") || prompt.includes("rename")) {
        return await this.handleMove(task);
      } else if (prompt.includes("delete") || prompt.includes("remove")) {
        return await this.handleDelete(task);
      } else if (prompt.includes("list") || prompt.includes("ls")) {
        return await this.handleList(task);
      } else if (prompt.includes("search") || prompt.includes("find") || prompt.includes("glob")) {
        return await this.handleSearch(task);
      } else if (prompt.includes("copy") || prompt.includes("duplicate")) {
        return await this.handleCopy(task);
      } else if (prompt.includes("mkdir") || prompt.includes("directory")) {
        return await this.handleCreateDirectory(task);
      } else {
        return this.formatResult(false, "", `Unknown file operation: ${task.prompt}`);
      }
    } catch (error) {
      return this.formatResult(false, "", error instanceof Error ? error.message : "Unknown error");
    }
  }

  private async handleRead(task: AgentTask): Promise<AgentResult> {
    const match = task.prompt.match(/read\s+(?:file\s+)?["']?([^"'\n]+)["']?/i);
    const path = match?.[1] || this.extractPath(task);

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      return this.formatResult(false, "", `File not found: ${fullPath}`);
    }

    const stats = statSync(fullPath);
    const content = readFileSync(fullPath, "utf-8");

    return this.formatResult(true, `Successfully read ${fullPath}`, undefined, {
      path: fullPath,
      content,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    });
  }

  private async handleWrite(task: AgentTask): Promise<AgentResult> {
    const contentMatch = task.prompt.match(/content[:\s]+([\s\S]*)/i);
    const pathMatch =
      task.prompt.match(/to\s+(?:file\s+)?["']?([^"'\n]+)["']?/i) ||
      task.prompt.match(/["']?([^"'\n]+\.\w+)["']?/);

    const content = contentMatch?.[1] || this.extractContent(task);
    let path = pathMatch?.[1];

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    if (!content) {
      return this.formatResult(false, "", "No content provided for writing");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, content, "utf-8");

    return this.formatResult(true, `Successfully wrote to ${fullPath}`, undefined, {
      path: fullPath,
    });
  }

  private async handleMove(task: AgentTask): Promise<AgentResult> {
    const sourceMatch = task.prompt.match(/from\s+["']?([^"'\n]+)["']?/i);
    const destMatch = task.prompt.match(/to\s+["']?([^"'\n]+)["']?/i);

    let source = sourceMatch?.[1] || this.extractPath(task);
    const destination = destMatch?.[1];

    if (!source || !destination) {
      return this.formatResult(false, "", "Source or destination path missing");
    }

    const fullSource = this.resolvePath(source, task.context?.cwd);
    const fullDest = this.resolvePath(destination, task.context?.cwd);

    if (!existsSync(fullSource)) {
      return this.formatResult(false, "", `Source file not found: ${fullSource}`);
    }

    renameSync(fullSource, fullDest);

    return this.formatResult(true, `Successfully moved ${fullSource} to ${fullDest}`, undefined, {
      source: fullSource,
      destination: fullDest,
    });
  }

  private async handleDelete(task: AgentTask): Promise<AgentResult> {
    const path = this.extractPath(task);

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      return this.formatResult(false, "", `File not found: ${fullPath}`);
    }

    unlinkSync(fullPath);

    return this.formatResult(true, `Successfully deleted ${fullPath}`, undefined, {
      path: fullPath,
    });
  }

  private async handleList(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(/list\s+(?:directory\s+)?["']?([^"'\n]+)["']?/i);
    const path = pathMatch?.[1] || task.context?.cwd || ".";

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath) || !lstatSync(fullPath).isDirectory()) {
      return this.formatResult(false, "", `Directory not found: ${fullPath}`);
    }

    const entries = readdirSync(fullPath).map((name) => {
      const fullEntryPath = join(fullPath, name);
      const stats = lstatSync(fullEntryPath);
      return {
        name,
        path: fullEntryPath,
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
      };
    });

    return this.formatResult(true, `Listed ${entries.length} entries in ${fullPath}`, undefined, {
      entries,
      path: fullPath,
    });
  }

  private async handleSearch(task: AgentTask): Promise<AgentResult> {
    const patternMatch = task.prompt.match(/(?:search|find|glob)[:\s]+["']?([^"'\n]+)["']?/i);
    const pattern = patternMatch?.[1] || "**/*";

    const cwd = task.context?.cwd || process.cwd();
    const files = await glob(pattern, { cwd, absolute: true });

    return this.formatResult(true, `Found ${files.length} files matching "${pattern}"`, undefined, {
      pattern,
      matches: files,
      count: files.length,
    });
  }

  private async handleCopy(task: AgentTask): Promise<AgentResult> {
    const sourceMatch = task.prompt.match(/from\s+["']?([^"'\n]+)["']?/i);
    const destMatch = task.prompt.match(/to\s+["']?([^"'\n]+)["']?/i);

    let source = sourceMatch?.[1] || this.extractPath(task);
    const destination = destMatch?.[1];

    if (!source || !destination) {
      return this.formatResult(false, "", "Source or destination path missing");
    }

    const fullSource = this.resolvePath(source, task.context?.cwd);
    const fullDest = this.resolvePath(destination, task.context?.cwd);

    if (!existsSync(fullSource)) {
      return this.formatResult(false, "", `Source file not found: ${fullSource}`);
    }

    const destDir = dirname(fullDest);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    copyFileSync(fullSource, fullDest);

    return this.formatResult(true, `Successfully copied ${fullSource} to ${fullDest}`, undefined, {
      source: fullSource,
      destination: fullDest,
    });
  }

  private async handleCreateDirectory(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(
      /(?:create\s+(?:directory|dir)|mkdir)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const path = pathMatch?.[1] || this.extractPath(task);

    if (!path) {
      return this.formatResult(false, "", "No directory path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }

    return this.formatResult(true, `Successfully created directory ${fullPath}`, undefined, {
      path: fullPath,
    });
  }

  private resolvePath(path: string, cwd?: string): string {
    if (isAbsolute(path)) {
      return path;
    }
    return join(cwd || process.cwd(), path);
  }

  private extractPath(task: AgentTask): string {
    const filePatterns = [
      /["']?([^"'\n]+\.\w+)["']?/,
      /path[:\s]+["']?([^"'\n]+)["']?/i,
      /file[:\s]+["']?([^"'\n]+)["']?/i,
    ];

    for (const pattern of filePatterns) {
      const match = task.prompt.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return "";
  }

  private extractContent(task: AgentTask): string {
    const contentMatch = task.prompt.match(/content[:\s]+([\s\S]*)/i);
    if (contentMatch) {
      return contentMatch[1];
    }

    const codeBlockMatch = task.prompt.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    return "";
  }
}

export default FileAgent;
