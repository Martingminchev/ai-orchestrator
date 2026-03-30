import { spawn, ChildProcess } from "child_process";
import { WorkerSpawnConfig, OrchestratorResult } from "./types";
import * as path from "path";

export class WorkerSpawner {
  private activeWorkers: Map<string, ChildProcess> = new Map();

  async spawn(config: WorkerSpawnConfig): Promise<ChildProcess> {
    const workerScript = path.join(__dirname, "..", "worker", "index.js");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MOLT_TASK_ID: config.task.id,
      MOLT_TASK_DESCRIPTION: config.task.description,
      MOLT_INPUT_PATH: config.task.inputPath,
      MOLT_OUTPUT_PATH: config.task.outputPath,
      MOLT_GLOBAL_CONTEXT: config.globalContext,
      MOLT_WORKER_DIR: config.workingDir,
    };

    const workerProcess = spawn("node", [workerScript], {
      env,
      cwd: config.workingDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.activeWorkers.set(config.task.id, workerProcess);

    workerProcess.on("error", (error) => {
      console.error(`Worker ${config.task.id} error:`, error);
    });

    workerProcess.on("exit", (code) => {
      if (code !== 0) {
        console.error(`Worker ${config.task.id} exited with code ${code}`);
      }
      this.activeWorkers.delete(config.task.id);
    });

    return workerProcess;
  }

  async terminate(taskId: string): Promise<void> {
    const worker = this.activeWorkers.get(taskId);
    if (worker) {
      worker.kill("SIGTERM");
      this.activeWorkers.delete(taskId);
    }
  }

  async terminateAll(): Promise<void> {
    for (const [taskId] of this.activeWorkers) {
      await this.terminate(taskId);
    }
  }

  getActiveWorkers(): string[] {
    return Array.from(this.activeWorkers.keys());
  }
}

export async function createWorkerProcess(
  config: WorkerSpawnConfig,
): Promise<{ process: ChildProcess; promise: Promise<OrchestratorResult> }> {
  const spawner = new WorkerSpawner();
  const process = await spawner.spawn(config);

  return {
    process,
    promise: new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      process.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout) as OrchestratorResult;
            resolve(result);
          } catch {
            resolve({
              success: false,
              taskId: config.task.id,
              error: "Failed to parse worker output",
            });
          }
        } else {
          resolve({
            success: false,
            taskId: config.task.id,
            error: stderr || `Worker exited with code ${code}`,
          });
        }
      });

      process.on("error", (error) => {
        resolve({
          success: false,
          taskId: config.task.id,
          error: error.message,
        });
      });
    }),
  };
}
