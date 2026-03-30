// Code Tools - Tool implementations for code operations
// Used by the code agent for code analysis and generation

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, isAbsolute, extname } from "path";
import { glob } from "glob";
import { execSync } from "child_process";
import type { ToolExecutor, ToolInput, ToolOutput, ToolDefinition } from "../../tools/types.js";

class ReadCodeTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "read_code",
      description: "Read source code from a file with syntax awareness",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the source file" },
          startLine: { type: "number", description: "Start line (optional)" },
          endLine: { type: "number", description: "End line (optional)" },
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

      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");
      
      const startLine = (input.startLine as number) || 1;
      const endLine = (input.endLine as number) || lines.length;
      
      const selectedLines = lines.slice(startLine - 1, endLine);
      const selectedContent = selectedLines.join("\n");

      const ext = extname(path).slice(1);
      const language = this.detectLanguage(ext);

      return {
        success: true,
        result: {
          content: selectedContent,
          path,
          language,
          lineCount: selectedLines.length,
          startLine,
          endLine: Math.min(endLine, lines.length),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }

  private detectLanguage(ext: string): string {
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      rb: "ruby",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      md: "markdown",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
    };
    return languageMap[ext] || "unknown";
  }
}

class WriteCodeTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "write_code",
      description: "Write code to a file with proper formatting",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to write the code" },
          content: { type: "string", description: "Code content to write" },
          language: { type: "string", description: "Programming language (optional, auto-detected from extension)" },
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

      writeFileSync(path, input.content as string, "utf-8");

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

class SearchCodeTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "search_code",
      description: "Search for patterns in code files",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern to search for (string or regex)" },
          filePattern: { type: "string", description: "Glob pattern for files to search (default: **/*.{ts,js,py})" },
          isRegex: { type: "boolean", description: "Treat pattern as regex (default: false)" },
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
      const searchPattern = input.pattern as string;
      const filePattern = (input.filePattern as string) || "**/*.{ts,js,py,tsx,jsx}";
      const isRegex = input.isRegex as boolean || false;

      const files = await glob(filePattern, { cwd: this.cwd, absolute: true, ignore: ["**/node_modules/**"] });
      const results: Array<{ file: string; line: number; content: string }> = [];

      const regex = isRegex ? new RegExp(searchPattern, "gi") : null;

      for (const file of files) {
        try {
          const content = readFileSync(file, "utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const matches = regex ? regex.test(line) : line.includes(searchPattern);

            if (matches) {
              results.push({
                file,
                line: i + 1,
                content: line.trim(),
              });
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return {
        success: true,
        result: {
          pattern: searchPattern,
          filePattern,
          matches: results,
          matchCount: results.length,
          filesSearched: files.length,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

class AnalyzeCodeTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "analyze_code",
      description: "Analyze code structure (functions, classes, imports, exports)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the source file to analyze" },
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

      const content = readFileSync(path, "utf-8");
      const ext = extname(path).slice(1);

      // Simple pattern-based analysis
      const analysis = {
        path,
        language: this.detectLanguage(ext),
        lines: content.split("\n").length,
        functions: this.extractFunctions(content, ext),
        classes: this.extractClasses(content, ext),
        imports: this.extractImports(content, ext),
        exports: this.extractExports(content, ext),
      };

      return { success: true, result: analysis };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }

  private detectLanguage(ext: string): string {
    const languageMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript",
      js: "javascript", jsx: "javascript",
      py: "python",
    };
    return languageMap[ext] || "unknown";
  }

  private extractFunctions(content: string, ext: string): string[] {
    const functions: string[] = [];

    // TypeScript/JavaScript
    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      const functionPatterns = [
        /function\s+(\w+)/g,
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g,
        /(\w+)\s*:\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      ];

      for (const pattern of functionPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (match[1] && !functions.includes(match[1])) {
            functions.push(match[1]);
          }
        }
      }
    }

    // Python
    if (ext === "py") {
      const defPattern = /def\s+(\w+)/g;
      let match;
      while ((match = defPattern.exec(content)) !== null) {
        if (match[1] && !functions.includes(match[1])) {
          functions.push(match[1]);
        }
      }
    }

    return functions;
  }

  private extractClasses(content: string, ext: string): string[] {
    const classes: string[] = [];

    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      const classPattern = /class\s+(\w+)/g;
      let match;
      while ((match = classPattern.exec(content)) !== null) {
        if (match[1]) classes.push(match[1]);
      }
    }

    if (ext === "py") {
      const classPattern = /class\s+(\w+)/g;
      let match;
      while ((match = classPattern.exec(content)) !== null) {
        if (match[1]) classes.push(match[1]);
      }
    }

    return classes;
  }

  private extractImports(content: string, ext: string): string[] {
    const imports: string[] = [];

    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      const importPattern = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
    }

    if (ext === "py") {
      const importPatterns = [
        /import\s+(\w+)/g,
        /from\s+(\w+(?:\.\w+)*)\s+import/g,
      ];
      for (const pattern of importPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (match[1] && !imports.includes(match[1])) {
            imports.push(match[1]);
          }
        }
      }
    }

    return imports;
  }

  private extractExports(content: string, ext: string): string[] {
    const exports: string[] = [];

    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      const exportPatterns = [
        /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/g,
        /export\s+\{\s*([^}]+)\s*\}/g,
      ];

      for (const pattern of exportPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (match[1]) {
            const names = match[1].split(",").map((s) => s.trim().split(" ")[0]);
            exports.push(...names.filter((n) => n && !exports.includes(n)));
          }
        }
      }
    }

    return exports;
  }
}

class EditCodeTool implements ToolExecutor {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  getDefinition(): ToolDefinition {
    return {
      name: "edit_code",
      description: "Edit code by replacing a specific section with new content",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to edit" },
          oldContent: { type: "string", description: "Existing content to replace" },
          newContent: { type: "string", description: "New content to insert" },
        },
        required: ["path", "oldContent", "newContent"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== "string") {
      errors.push("path is required and must be a string");
    }
    if (typeof input.oldContent !== "string") {
      errors.push("oldContent must be a string");
    }
    if (typeof input.newContent !== "string") {
      errors.push("newContent must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const path = this.resolvePath(input.path as string);
      
      if (!existsSync(path)) {
        return { success: false, error: `File not found: ${path}` };
      }

      const content = readFileSync(path, "utf-8");
      const oldContent = input.oldContent as string;
      const newContent = input.newContent as string;

      if (!content.includes(oldContent)) {
        return { success: false, error: "oldContent not found in file" };
      }

      const occurrences = content.split(oldContent).length - 1;
      if (occurrences > 1) {
        return { success: false, error: `oldContent found ${occurrences} times. Please provide more context to uniquely identify the section.` };
      }

      const newFileContent = content.replace(oldContent, newContent);
      writeFileSync(path, newFileContent, "utf-8");

      return {
        success: true,
        result: { path, edited: true },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.cwd, path);
  }
}

/**
 * Create all code tools
 */
export function createCodeTools(cwd?: string): ToolExecutor[] {
  return [
    new ReadCodeTool(cwd),
    new WriteCodeTool(cwd),
    new SearchCodeTool(cwd),
    new AnalyzeCodeTool(cwd),
    new EditCodeTool(cwd),
  ];
}
