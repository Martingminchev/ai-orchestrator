import * as fs from "fs";
import * as path from "path";
import { ContextFile, SubagentConfig } from "./types";
import { ContextWriter, createContextFile } from "./write-context";

export interface ContextManagerConfig {
  contextDir: string;
  maxContextSize: number;
  defaultPriority: number;
}

export class ContextManager {
  private writer: ContextWriter;
  private config: ContextManagerConfig;
  private contextCache: Map<string, ContextFile[]> = new Map();

  constructor(config?: Partial<ContextManagerConfig>) {
    this.config = {
      contextDir: config?.contextDir || path.join(process.cwd(), ".molt", "context"),
      maxContextSize: config?.maxContextSize || 50000,
      defaultPriority: config?.defaultPriority || 0,
      ...config,
    };

    this.writer = new ContextWriter(this.config.contextDir);
  }

  async prepareSubagentContext(subagentConfig: SubagentConfig): Promise<string[]> {
    const contexts: ContextFile[] = [];

    const globalContext = this.loadGlobalContext();
    if (globalContext) {
      contexts.push(createContextFile("global.md", globalContext, 0));
    }

    const taskContext = this.loadTaskContext(subagentConfig.task);
    if (taskContext) {
      contexts.push(createContextFile("task.md", taskContext, 1));
    }

    if (subagentConfig.contextFiles && subagentConfig.contextFiles.length > 0) {
      contexts.push(...subagentConfig.contextFiles);
    }

    const priorityContexts = this.loadPriorityContexts(subagentConfig.type);
    contexts.push(...priorityContexts);

    const mergedContent = this.mergeContexts(contexts);
    const truncatedContent = this.truncateIfNeeded(mergedContent);

    const mainContext = createContextFile(`${subagentConfig.id}_main.md`, truncatedContent, 10);

    const writtenPaths = await this.writer.writeMultipleContexts([mainContext, ...contexts]);

    this.contextCache.set(subagentConfig.id, contexts);

    return writtenPaths;
  }

  private loadGlobalContext(): string | null {
    const globalPaths = [
      path.join(process.cwd(), ".molt", "global.md"),
      path.join(process.cwd(), "global.md"),
      path.join(__dirname, "..", "..", ".molt", "global.md"),
    ];

    for (const globalPath of globalPaths) {
      if (fs.existsSync(globalPath)) {
        return fs.readFileSync(globalPath, "utf-8");
      }
    }

    return null;
  }

  private loadTaskContext(taskDescription: string): string | null {
    const taskContextPath = path.join(process.cwd(), ".molt", "task.md");
    if (fs.existsSync(taskContextPath)) {
      return fs.readFileSync(taskContextPath, "utf-8");
    }

    return `# Task\n\n${taskDescription}`;
  }

  private loadPriorityContexts(subagentType: string): ContextFile[] {
    const priorityPaths = [
      path.join(process.cwd(), ".molt", "context", `${subagentType}.md`),
      path.join(process.cwd(), ".molt", `subagent_${subagentType}.md`),
      path.join(__dirname, "..", "..", ".molt", "context", `${subagentType}.md`),
    ];

    const contexts: ContextFile[] = [];
    let priority = 5;

    for (const priorityPath of priorityPaths) {
      if (fs.existsSync(priorityPath)) {
        contexts.push(
          createContextFile(priorityPath, fs.readFileSync(priorityPath, "utf-8"), priority++),
        );
      }
    }

    return contexts;
  }

  private mergeContexts(contexts: ContextFile[]): string {
    const sorted = [...contexts].sort((a, b) => a.priority - b.priority);

    return sorted
      .map((c) => {
        const header = c.priority < 10 ? `\n## ${c.path}\n` : "";
        return `${header}${c.content}`;
      })
      .join("\n\n---\n\n");
  }

  private truncateIfNeeded(content: string): string {
    if (content.length <= this.config.maxContextSize) {
      return content;
    }

    return (
      content.slice(0, this.config.maxContextSize - 100) +
      "\n\n[Context truncated due to size limits]\n"
    );
  }

  async clearCache(subagentId?: string): Promise<void> {
    if (subagentId) {
      this.contextCache.delete(subagentId);
    } else {
      this.contextCache.clear();
    }
  }

  getCacheSize(): number {
    return this.contextCache.size;
  }

  getContextDir(): string {
    return this.writer.getContextDir();
  }
}

export const contextManager = new ContextManager();
