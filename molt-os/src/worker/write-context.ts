import * as fs from "fs";
import * as path from "path";
import { ContextFile } from "./types";

export class ContextWriter {
  private contextDir: string;

  constructor(contextDir: string) {
    this.contextDir = contextDir;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.contextDir)) {
      fs.mkdirSync(this.contextDir, { recursive: true });
    }
  }

  async writeContext(context: ContextFile): Promise<string> {
    const fileName = `${context.priority}_${Date.now()}_${path.basename(context.path)}`;
    const fullPath = path.join(this.contextDir, fileName);

    fs.writeFileSync(fullPath, context.content, "utf-8");

    return fullPath;
  }

  async writeMultipleContexts(contexts: ContextFile[]): Promise<string[]> {
    const sortedContexts = [...contexts].sort((a, b) => a.priority - b.priority);
    const writtenPaths: string[] = [];

    for (const context of sortedContexts) {
      const writtenPath = await this.writeContext(context);
      writtenPaths.push(writtenPath);
    }

    return writtenPaths;
  }

  async writeTaskContext(
    taskId: string,
    taskDescription: string,
    subagentType: string,
    additionalContext: Record<string, unknown>,
  ): Promise<string> {
    const contextContent = this.generateTaskContext(
      taskDescription,
      subagentType,
      additionalContext,
    );
    const fileName = `${taskId}_context.md`;
    const fullPath = path.join(this.contextDir, fileName);

    fs.writeFileSync(fullPath, contextContent, "utf-8");

    return fullPath;
  }

  private generateTaskContext(
    taskDescription: string,
    subagentType: string,
    additionalContext: Record<string, unknown>,
  ): string {
    let context = `# Task Context\n\n`;
    context += `## Task Description\n${taskDescription}\n\n`;
    context += `## Subagent Type\n${subagentType}\n\n`;

    if (Object.keys(additionalContext).length > 0) {
      context += `## Additional Context\n`;
      context += JSON.stringify(additionalContext, null, 2);
      context += "\n\n";
    }

    context += `## Instructions\n`;
    context += `1. Read and understand the task description above\n`;
    context += `2. Use the additional context provided\n`;
    context += `3. Complete the task efficiently\n`;
    context += `4. Write your output to the specified output path\n`;

    return context;
  }

  async cleanup(): Promise<void> {
    if (fs.existsSync(this.contextDir)) {
      const files = fs.readdirSync(this.contextDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.contextDir, file));
      }
    }
  }

  getContextDir(): string {
    return this.contextDir;
  }
}

export function createContextFile(
  path: string,
  content: string,
  priority: number = 0,
): ContextFile {
  return { path, content, priority };
}

export function mergeContexts(contexts: ContextFile[]): string {
  const sorted = [...contexts].sort((a, b) => a.priority - b.priority);
  return sorted.map((c) => c.content).join("\n\n---\n\n");
}
