import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { SubagentConfig, SubagentResult } from "./types";

export class SubagentSpawner {
  private activeSubagents: Map<string, ChildProcess> = new Map();
  private readonly maxParallel: number;
  private currentParallel = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(maxParallel: number = 4) {
    this.maxParallel = maxParallel;
  }

  private async processQueue(): Promise<void> {
    while (this.currentParallel < this.maxParallel && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    this.processQueue();
  }

  async spawn(config: SubagentConfig): Promise<SubagentResult> {
    return new Promise((resolve) => {
      this.enqueue(async () => {
        this.currentParallel++;

        try {
          const result = await this.runSubagent(config);
          this.currentParallel--;
          this.processQueue();
          resolve(result);
        } catch (error) {
          this.currentParallel--;
          this.processQueue();
          resolve({
            subagentId: config.id,
            success: false,
            error: (error as Error).message,
          });
        }
      });
    });
  }

  private async runSubagent(config: SubagentConfig): Promise<SubagentResult> {
    return new Promise((resolve) => {
      const subagentScript = path.join(__dirname, "..", "subagents", "index.js");

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        MOLT_SUBAGENT_ID: config.id,
        MOLT_SUBAGENT_TYPE: config.type,
        MOLT_TASK: config.task,
        MOLT_WORKING_DIR: config.workingDir,
      };

      const subagentProcess = spawn("node", [subagentScript], {
        env,
        cwd: config.workingDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.activeSubagents.set(config.id, subagentProcess);

      let stdout = "";
      let stderr = "";

      subagentProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      subagentProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      subagentProcess.on("close", (code) => {
        this.activeSubagents.delete(config.id);

        if (code === 0) {
          try {
            const result = JSON.parse(stdout) as SubagentResult;
            resolve(result);
          } catch {
            resolve({
              subagentId: config.id,
              success: true,
              outputPath: stdout.trim() || undefined,
            });
          }
        } else {
          resolve({
            subagentId: config.id,
            success: false,
            error: stderr || `Subagent exited with code ${code}`,
          });
        }
      });

      subagentProcess.on("error", (error) => {
        this.activeSubagents.delete(config.id);
        resolve({
          subagentId: config.id,
          success: false,
          error: error.message,
        });
      });
    });
  }

  async spawnMultiple(configs: SubagentConfig[]): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];

    const promises = configs.map((config) => this.spawn(config));
    results.push(...(await Promise.all(promises)));

    return results;
  }

  async spawnSequential(configs: SubagentConfig[]): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];

    for (const config of configs) {
      const result = await this.spawn(config);
      results.push(result);
    }

    return results;
  }

  async terminate(subagentId: string): Promise<void> {
    const subagent = this.activeSubagents.get(subagentId);
    if (subagent) {
      subagent.kill("SIGTERM");
      this.activeSubagents.delete(subagentId);
    }
  }

  async terminateAll(): Promise<void> {
    for (const [subagentId] of this.activeSubagents) {
      await this.terminate(subagentId);
    }
  }

  getActiveCount(): number {
    return this.currentParallel;
  }

  getQueuedCount(): number {
    return this.queue.length;
  }

  getActiveSubagentIds(): string[] {
    return Array.from(this.activeSubagents.keys());
  }
}

export function createSubagentConfig(
  id: string,
  type: string,
  task: string,
  contextFiles: { path: string; content: string; priority: number }[],
  workingDir: string,
): SubagentConfig {
  return {
    id,
    type,
    task,
    contextFiles: contextFiles.map((cf) => ({
      ...cf,
      path: cf.path,
      content: cf.content,
      priority: cf.priority,
    })),
    workingDir,
  };
}
