import { ResearchTask, ResearchResult } from "./types";

export interface ParallelTaskConfig {
  maxParallel: number;
  timeout: number;
  retryCount: number;
}

export class ParallelTaskExecutor {
  private config: ParallelTaskConfig;
  private activeTasks: Map<string, Promise<ResearchResult>> = new Map();

  constructor(config?: Partial<ParallelTaskConfig>) {
    this.config = {
      maxParallel: config?.maxParallel || 4,
      timeout: config?.timeout || 60000,
      retryCount: config?.retryCount || 2,
      ...config,
    };
  }

  async executeResearchTasks(tasks: ResearchTask[]): Promise<ResearchResult[]> {
    const results: ResearchResult[] = [];
    const queue = [...tasks];
    const running: Promise<ResearchResult>[] = [];

    while (queue.length > 0 || running.length > 0) {
      while (running.length < this.config.maxParallel && queue.length > 0) {
        const task = queue.shift()!;
        const promise = this.executeTask(task);
        running.push(promise);
        this.activeTasks.set(task.id, promise);

        promise.finally(() => {
          this.activeTasks.delete(task.id);
        });
      }

      if (running.length > 0) {
        const completed = await Promise.race(running);
        results.push(completed);
        running.splice(
          running.indexOf(this.activeTasks.get(completed.taskId!) as Promise<ResearchResult>),
          1,
        );
      }
    }

    return results;
  }

  private async executeTask(task: ResearchTask): Promise<ResearchResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
      try {
        return await this.performResearch(task);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Research task ${task.id} attempt ${attempt} failed: ${lastError.message}`);
      }
    }

    return {
      taskId: task.id,
      findings: [],
      sources: [],
      confidence: 0,
      recommendations: [`Failed after ${this.config.retryCount} attempts: ${lastError?.message}`],
    };
  }

  private async performResearch(task: ResearchTask): Promise<ResearchResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Research task timed out"));
      }, this.config.timeout);

      const findings: string[] = [];
      const sources: string[] = [];
      const recommendations: string[] = [];

      for (const area of task.areas) {
        findings.push(`Researched ${area} for: ${task.query}`);
        sources.push(`Source: ${area}`);
      }

      recommendations.push(`For ${task.query}, consider: ${task.areas.join(", ")}`);

      clearTimeout(timeout);

      resolve({
        taskId: task.id,
        findings,
        sources,
        confidence: this.calculateConfidence(task.depth),
        recommendations,
      });
    });
  }

  private calculateConfidence(depth: ResearchTask["depth"]): number {
    switch (depth) {
      case "surface":
        return 0.5;
      case "medium":
        return 0.7;
      case "deep":
        return 0.9;
      default:
        return 0.5;
    }
  }

  cancelTask(taskId: string): boolean {
    const promise = this.activeTasks.get(taskId);
    if (promise) {
      this.activeTasks.delete(taskId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    this.activeTasks.clear();
  }

  getActiveCount(): number {
    return this.activeTasks.size;
  }

  getQueuedCount(): number {
    return 0;
  }
}

export async function createResearchTasks(
  baseTask: string,
  areas: string[],
  depths: ResearchTask["depth"][],
): Promise<ResearchTask[]> {
  const tasks: ResearchTask[] = [];

  for (let i = 0; i < areas.length; i++) {
    tasks.push({
      id: `research_${Date.now()}_${i}`,
      query: baseTask,
      areas: [areas[i]],
      depth: depths[i % depths.length],
    });
  }

  return tasks;
}

export function mergeResearchResults(results: ResearchResult[]): {
  allFindings: string[];
  allSources: string[];
  allRecommendations: string[];
  averageConfidence: number;
  topRecommendations: string[];
} {
  const allFindings: string[] = [];
  const allSources: string[] = [];
  const allRecommendations: string[] = [];
  let totalConfidence = 0;

  for (const result of results) {
    allFindings.push(...result.findings);
    allSources.push(...result.sources);
    allRecommendations.push(...result.recommendations);
    totalConfidence += result.confidence;
  }

  const averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;

  const topRecommendations = allRecommendations.slice(0, 5);

  return {
    allFindings,
    allSources,
    allRecommendations,
    averageConfidence,
    topRecommendations,
  };
}
