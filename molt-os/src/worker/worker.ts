import * as crypto from 'crypto';
import {
  WorkerTask,
  WorkerResult,
  SubagentResult,
  ValidationResult,
  DraftPlan,
  SubagentConfig,
  ContextFile,
  WorkerMessage
} from './types.js';
import { AgentSpawner, createAgentSpawner } from './agent-spawner.js';
import { createSubagentConfig } from './spawn-subagent.js';
import { SubagentValidator, subagentValidator } from './validate.js';
import { ContextManager } from './context-manager.js';
import { ContextWriter, createContextFile } from './write-context.js';
import { plannerClient, PlannerClient } from './planner.js';

export interface WorkerConfig {
  maxParallelSubagents?: number;
  subagentTimeout?: number;
  plannerUrl?: string;
  contextDir?: string;
}

export interface SubagentTask {
  id: string;
  type: 'file' | 'research' | 'code' | 'system';
  prompt: string;
  context?: Context;
  priority?: number;
}

export interface SubagentProcess {
  id: string;
  type: string;
  pid?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: SubagentResult;
}

export interface Context {
  global: string;
  location: string;
  skill: string;
  rag: string[];
}

export interface RefinedPlan {
  steps: RefinedStep[];
  executionOrder: string[];
  totalEstimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  checkpoints: Checkpoint[];
}

export interface RefinedStep {
  id: string;
  description: string;
  subagentType: string;
  expectedOutput: string;
  dependencies: string[];
  priority: number;
  validationCriteria: string[];
  rollbackStrategy?: string;
}

export interface Checkpoint {
  stepId: string;
  validationRequired: string[];
  continueOnFailure: boolean;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  subagentResults: SubagentResult[];
  outputPath?: string;
  error?: string;
}

export interface ProgressUpdate {
  taskId: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  progress: number;
  message: string;
}

export interface WorkerStatus {
  activeSubagents: number;
  queuedSubagents: number;
}

export class Worker {
  private config: WorkerConfig;
  private subagentQueue: SubagentTask[] = [];
  private activeSubagents: Map<string, SubagentProcess> = new Map();
  private spawner: AgentSpawner;
  private validator: SubagentValidator;
  private contextManager: ContextManager;
  private plannerClient: PlannerClient;
  private currentTaskId: string | null = null;
  private progressCallback: ((update: ProgressUpdate) => void) | null = null;
  private resultCallback: ((result: TaskResult) => void) | null = null;

  constructor(config?: WorkerConfig) {
    this.config = config || {};
    this.spawner = createAgentSpawner({ maxParallel: this.config.maxParallelSubagents || 4 });
    this.validator = subagentValidator;
    this.contextManager = new ContextManager({ contextDir: '.molt/context' });
    this.plannerClient = plannerClient;
  }

  getConfig(): WorkerConfig {
    return this.config;
  }

  getStatus(): WorkerStatus {
    return {
      activeSubagents: this.activeSubagents.size,
      queuedSubagents: this.subagentQueue.length
    };
  }

  setProgressCallback(callback: (update: ProgressUpdate) => void): void {
    this.progressCallback = callback;
  }

  setResultCallback(callback: (result: TaskResult) => void): void {
    this.resultCallback = callback;
  }

  private async reportProgress(taskId: string, status: ProgressUpdate['status'], progress: number, message: string): Promise<void> {
    const update: ProgressUpdate = { taskId, status, progress, message };
    if (this.progressCallback) {
      this.progressCallback(update);
    }
  }

  private reportResult(result: TaskResult): void {
    if (this.resultCallback) {
      this.resultCallback(result);
    }
  }

  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    this.currentTaskId = task.id;

    try {
      await this.reportProgress(task.id, 'started', 0, 'Task execution started');

      const context = await this.loadContext(task);
      const refinedPlan = await this.sendToPlanner({
        taskId: task.id,
        steps: [],
        dependencies: {},
        estimatedTime: 0,
        resources: []
      });

      await this.reportProgress(task.id, 'progress', 10, 'Planning completed, executing subagents');

      const subagentResults = await this.executeRefinedPlan(refinedPlan, context, task);

      await this.reportProgress(task.id, 'progress', 90, 'Validating results');

      const validationResults = await this.validator.validateMultiple(subagentResults);
      const allPassed = Array.from(validationResults.values()).every(vr => vr.every(r => r.passed));

      await this.reportProgress(task.id, 'completed', 100, 'Task completed');

      return {
        success: allPassed,
        taskId: task.id,
        subagentResults,
        outputPath: task.outputPath,
        validationResults: Array.from(validationResults.values()).flat()
      };
    } catch (error) {
      await this.reportProgress(task.id, 'failed', 0, `Error: ${(error as Error).message}`);

      return {
        success: false,
        taskId: task.id,
        subagentResults: [],
        outputPath: task.outputPath,
        error: (error as Error).message
      };
    } finally {
      this.currentTaskId = null;
    }
  }

  async queueSubagent(subagent: SubagentTask): Promise<void> {
    if (subagent.priority !== undefined) {
      const insertIndex = this.subagentQueue.findIndex(t => (t.priority || 0) < (subagent.priority || 0));
      if (insertIndex === -1) {
        this.subagentQueue.push(subagent);
      } else {
        this.subagentQueue.splice(insertIndex, 0, subagent);
      }
    } else {
      this.subagentQueue.push(subagent);
    }
  }

  getNextSubagent(): SubagentTask | undefined {
    return this.subagentQueue.shift();
  }

  async sendToPlanner(plan: DraftPlan): Promise<RefinedPlan> {
    const taskId = this.currentTaskId || 'unknown';

    try {
      await this.reportProgress(taskId, 'progress', 5, 'Sending plan to planner');

      const input = {
        taskId,
        draftPlan: plan,
        context: '',
        constraints: []
      };

      const response = await this.plannerClient.sendRequest(input);

      return {
        steps: response.refinedPlan.steps.map(s => ({
          ...s,
          validationCriteria: s.validationCriteria || []
        })),
        executionOrder: response.refinedPlan.executionOrder || response.refinedPlan.steps.map(s => s.id),
        totalEstimatedTime: response.refinedPlan.totalEstimatedTime || 0,
        riskLevel: response.refinedPlan.riskLevel || 'medium',
        checkpoints: response.refinedPlan.checkpoints || []
      };
    } catch (error) {
      console.error('Planner communication error:', error);
      throw new Error(`Planner request failed: ${(error as Error).message}`);
    }
  }

  async receiveFromPlanner(refinedPlan: RefinedPlan): Promise<void> {
    console.log(`Received refined plan with ${refinedPlan.steps.length} steps`);
  }

  async loadContext(task: WorkerTask): Promise<Context> {
    const globalContext = this.loadGlobalContext(task.globalContext);
    const locationContext = this.loadLocationContext(task.inputPath);
    const skillContext = this.loadSkillContext();
    const ragContext = this.loadRagContext(task);

    return {
      global: globalContext,
      location: locationContext,
      skill: skillContext,
      rag: ragContext
    };
  }

  private loadGlobalContext(globalContext: string): string {
    return globalContext || '# Global Context\nNo global context provided.';
  }

  private loadLocationContext(inputPath: string): string {
    const path = require('path');
    const fs = require('fs');

    if (inputPath && fs.existsSync(inputPath)) {
      return `# Location Context\n\nFile: ${inputPath}\n\n${fs.readFileSync(inputPath, 'utf-8')}`;
    }

    return `# Location Context\n\nWorking directory: ${process.cwd()}`;
  }

  private loadSkillContext(): string {
    return '# Skill Context\n\nAvailable skills:\n- file: File operations\n- research: Research and information gathering\n- code: Code analysis and generation\n- system: System operations';
  }

  private loadRagContext(task: WorkerTask): string[] {
    return [
      `Task: ${task.description}`,
      `Input: ${task.inputPath}`,
      `Output: ${task.outputPath}`
    ];
  }

  attachContext(subagent: SubagentTask, context: Context): void {
    subagent.context = context;
  }

  async writeContextFile(subagent: SubagentTask, contextContent: string): Promise<string> {
    const path = require('path');
    const fs = require('fs');

    const contextDir = path.resolve('.molt/context');
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    const fileName = `${subagent.id}_context_${Date.now()}.md`;
    const filePath = path.join(contextDir, fileName);

    fs.writeFileSync(filePath, contextContent, 'utf-8');

    return filePath;
  }

  private async executeRefinedPlan(refinedPlan: RefinedPlan, context: Context, task: WorkerTask): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];
    const totalSteps = refinedPlan.steps.length;
    let completedSteps = 0;

    for (const step of refinedPlan.steps) {
      const subagentTask: SubagentTask = {
        id: step.id,
        type: step.subagentType as 'file' | 'research' | 'code' | 'system',
        prompt: step.description,
        priority: step.priority
      };

      await this.queueSubagent(subagentTask);
    }

    const executeNext = async (): Promise<void> => {
      const nextTask = this.getNextSubagent();
      if (!nextTask) {
        return;
      }

      const progress = Math.round((completedSteps / totalSteps) * 80) + 10;
      await this.reportProgress(task.id, 'progress', progress, `Executing: ${nextTask.prompt}`);

      try {
        const result = await this.spawnSubagent(nextTask);
        results.push(result);

        if (result.success) {
          completedSteps++;
        } else {
          const step = refinedPlan.steps.find(s => s.id === nextTask.id);
          if (!this.shouldContinueOnFailure(nextTask.id, refinedPlan)) {
            throw new Error(`Subagent ${nextTask.id} failed: ${result.error}`);
          }
        }
      } catch (error) {
        results.push({
          subagentId: nextTask.id,
          success: false,
          error: (error as Error).message
        });

        if (!this.shouldContinueOnFailure(nextTask.id, refinedPlan)) {
          throw error;
        }
      }

      await executeNext();
    };

    const parallelPromises: Promise<void>[] = [];
    const maxParallel = Math.min(this.config.maxParallelSubagents || 4, totalSteps);

    for (let i = 0; i < maxParallel; i++) {
      parallelPromises.push(executeNext());
    }

    await Promise.all(parallelPromises);

    return results;
  }

  private shouldContinueOnFailure(stepId: string, refinedPlan: RefinedPlan): boolean {
    const checkpoint = refinedPlan.checkpoints.find(c => c.stepId === stepId);
    return checkpoint?.continueOnFailure || false;
  }

  async spawnSubagent(subagentTask: SubagentTask): Promise<SubagentResult> {
    const subagentId = subagentTask.id || crypto.randomUUID();

    let contextFiles: ContextFile[] = [];

    if (subagentTask.context) {
      const contextWriter = new ContextWriter('.molt/context');

      const globalFile = createContextFile(
        `${subagentId}_global.md`,
        subagentTask.context.global,
        0
      );
      const locationFile = createContextFile(
        `${subagentId}_location.md`,
        subagentTask.context.location,
        1
      );
      const skillFile = createContextFile(
        `${subagentId}_skill.md`,
        subagentTask.context.skill,
        2
      );

      contextFiles = [globalFile, locationFile, skillFile];

      if (subagentTask.context.rag && subagentTask.context.rag.length > 0) {
        const ragFile = createContextFile(
          `${subagentId}_rag.md`,
          subagentTask.context.rag.join('\n\n'),
          3
        );
        contextFiles.push(ragFile);
      }
    }

    const config = createSubagentConfig(
      subagentId,
      subagentTask.type,
      subagentTask.prompt,
      contextFiles.map(cf => ({
        path: cf.path,
        content: cf.content,
        priority: cf.priority
      })),
      process.cwd()
    );

    const processEntry: SubagentProcess = {
      id: subagentId,
      type: subagentTask.type,
      status: 'running'
    };

    this.activeSubagents.set(subagentId, processEntry);

    try {
      const result = await this.spawner.spawn(config);

      processEntry.status = result.success ? 'completed' : 'failed';
      processEntry.result = result;

      return result;
    } catch (error) {
      processEntry.status = 'failed';
      processEntry.result = {
        subagentId,
        success: false,
        error: (error as Error).message
      };

      return processEntry.result;
    } finally {
      this.activeSubagents.delete(subagentId);
    }
  }

  async validateResult(result: SubagentResult): Promise<ValidationResult[]> {
    return await this.validator.validate(result);
  }

  async testOutput(output: unknown): Promise<boolean> {
    if (output === null || output === undefined) {
      return false;
    }

    if (typeof output === 'string') {
      return output.trim().length > 0;
    }

    if (typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      return obj.success === true || obj.output !== undefined || obj.result !== undefined;
    }

    return true;
  }

  async reportToOrchestrator(result: TaskResult): Promise<void> {
    const taskId = this.currentTaskId || result.taskId;

    await this.reportProgress(
      taskId,
      result.success ? 'completed' : 'failed',
      result.success ? 100 : 0,
      result.success ? 'All subagents completed successfully' : `Task failed: ${result.error}`
    );

    this.reportResult(result);
  }

  async terminateSubagent(subagentId: string): Promise<void> {
    await this.spawner.terminate(subagentId);
    const processEntry = this.activeSubagents.get(subagentId);
    if (processEntry) {
      processEntry.status = 'failed';
      this.activeSubagents.delete(subagentId);
    }
  }

  async terminateAll(): Promise<void> {
    await this.spawner.terminateAll();
    this.activeSubagents.clear();
    this.subagentQueue = [];
  }

  async cleanup(): Promise<void> {
    await this.terminateAll();
    await this.contextManager.clearCache();
  }
}

export const worker = new Worker();
