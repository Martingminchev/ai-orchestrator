export interface PlannerConfig {
  optimizationLevel?: string;
  maxParallelResearch?: number;
}

export interface PlannerStatus {
  activePlans: number;
  queuedPlans: number;
}

export interface Task {
  id: string;
  type: string;
  description: string;
  requirements?: string[];
  constraints?: Record<string, unknown>;
  context?: Context;
}

export interface Context {
  id: string;
  data: Record<string, unknown>;
  expiresAt?: Date;
}

export interface DraftPlan {
  id: string;
  taskId: string;
  goals: string[];
  subtasks: DraftSubtask[];
  metadata?: Record<string, unknown>;
}

export interface DraftSubtask {
  id: string;
  description: string;
  agentType: string;
  dependsOn: string[];
}

export interface RefinedPlan {
  id: string;
  taskId: string;
  analysis: AnalysisResult;
  subtasks: Subtask[];
  parallelGroups: Subtask[][];
  researchTasks: ResearchTask[];
  risks: Risk[];
  mitigations: string[];
  metadata: PlanMetadata;
}

export interface PlanMetadata {
  createdAt: Date;
  optimizedAt: Date;
  version: string;
}

export interface SubtaskResult {
  subtaskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  metrics?: SubtaskMetrics;
}

export interface SubtaskMetrics {
  duration: number;
  tokensUsed?: number;
  agentsUsed?: string[];
}

export interface AnalysisResult {
  taskType: string;
  complexity: 'low' | 'medium' | 'high';
  requiredAgents: string[];
  estimatedSteps: number;
  dependencies: string[];
  risks: Risk[];
}

export interface Subtask {
  id: string;
  agentType: string;
  description: string;
  prompt: string;
  dependsOn: string[];
  parallelGroup?: number;
  context?: Context;
  priority?: number;
  timeout?: number;
  retries?: number;
}

export interface ResearchTask {
  id: string;
  query: string;
  subtaskId: string;
  priority: number;
  sources?: string[];
}

export interface Risk {
  type: string;
  probability: 'low' | 'medium' | 'high';
  impact: string;
  mitigation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const AGENT_CAPABILITIES: Record<string, string[]> = {
  'file-agent': ['file-read', 'file-write', 'file-delete', 'directory-create'],
  'code-agent': ['code-analysis', 'code-refactor', 'code-review'],
  'test-agent': ['test-run', 'test-generate', 'test-analyze'],
  'git-agent': ['git-status', 'git-commit', 'git-push', 'git-branch'],
  'research-agent': ['web-search', 'documentation-read', 'codebase-search'],
  'build-agent': ['compile', 'package', 'deploy'],
  'docs-agent': ['readme-generate', 'api-docs', 'comment-generation'],
};

const TASK_COMPLEXITY_THRESHOLDS = {
  low: 3,
  medium: 7,
  high: Infinity,
};

export class Planner {
  private config: PlannerConfig;
  private activePlans: Map<string, RefinedPlan> = new Map();
  private planCounter: number = 0;

  constructor(config?: PlannerConfig) {
    this.config = config || {
      optimizationLevel: 'standard',
      maxParallelResearch: 3,
    };
  }

  getConfig(): PlannerConfig {
    return this.config;
  }

  getStatus(): PlannerStatus {
    return {
      activePlans: this.activePlans.size,
      queuedPlans: 0,
    };
  }

  async analyzeTask(task: Task): Promise<AnalysisResult> {
    const taskType = this.inferTaskType(task);
    const complexity = this.assessComplexity(task);
    const requiredAgents = this.determineRequiredAgents(task);
    const estimatedSteps = this.estimateSteps(task);
    const dependencies = this.identifyDependencies(task);
    const risks = await this.assessTaskRisks(task);

    return {
      taskType,
      complexity,
      requiredAgents,
      estimatedSteps,
      dependencies,
      risks,
    };
  }

  private inferTaskType(task: Task): string {
    const description = task.description.toLowerCase();
    const type = task.type || 'general';

    if (description.includes('research') || description.includes('investigate')) {
      return 'research';
    }
    if (description.includes('build') || description.includes('create') || description.includes('implement')) {
      return 'implementation';
    }
    if (description.includes('test') || description.includes('verify')) {
      return 'testing';
    }
    if (description.includes('refactor') || description.includes('improve')) {
      return 'refactoring';
    }
    if (description.includes('review') || description.includes('analyze')) {
      return 'analysis';
    }
    if (description.includes('fix') || description.includes('resolve') || description.includes('bug')) {
      return 'bugfix';
    }
    return type;
  }

  private assessComplexity(task: Task): 'low' | 'medium' | 'high' {
    let score = 0;

    const description = task.description.toLowerCase();
    const requirements = task.requirements || [];

    const complexityIndicators = [
      { keywords: ['complex', 'multiple', 'several', 'various'], weight: 2 },
      { keywords: ['simple', 'basic', 'single', 'one'], weight: -1 },
      { keywords: ['integrate', 'migrate', 'transform'], weight: 3 },
      { keywords: ['database', 'api', 'service', 'microservice'], weight: 2 },
      { keywords: ['security', 'authentication', 'authorization'], weight: 3 },
    ];

    for (const indicator of complexityIndicators) {
      for (const keyword of indicator.keywords) {
        if (description.includes(keyword)) {
          score += indicator.weight;
        }
      }
    }

    score += requirements.length;

    if (task.context && Object.keys(task.context).length > 3) {
      score += 2;
    }

    if (score <= TASK_COMPLEXITY_THRESHOLDS.low) {
      return 'low';
    } else if (score <= TASK_COMPLEXITY_THRESHOLDS.medium) {
      return 'medium';
    }
    return 'high';
  }

  private determineRequiredAgents(task: Task): string[] {
    const agents = new Set<string>();
    const description = task.description.toLowerCase();
    const requirements = task.requirements || [];

    const agentMappings = [
      { keywords: ['file', 'directory', 'folder'], agent: 'file-agent' },
      { keywords: ['code', 'function', 'class', 'module'], agent: 'code-agent' },
      { keywords: ['test', 'spec', 'coverage'], agent: 'test-agent' },
      { keywords: ['git', 'version', 'commit', 'branch'], agent: 'git-agent' },
      { keywords: ['research', 'documentation', 'search'], agent: 'research-agent' },
      { keywords: ['build', 'compile', 'package', 'deploy'], agent: 'build-agent' },
      { keywords: ['document', 'readme', 'comment'], agent: 'docs-agent' },
    ];

    for (const mapping of agentMappings) {
      for (const keyword of mapping.keywords) {
        if (description.includes(keyword) || requirements.some(r => r.toLowerCase().includes(keyword))) {
          agents.add(mapping.agent);
          break;
        }
      }
    }

    agents.add('file-agent');

    return Array.from(agents);
  }

  private estimateSteps(task: Task): number {
    const complexity = this.assessComplexity(task);
    const baseSteps: Record<'low' | 'medium' | 'high', number> = {
      low: 3,
      medium: 7,
      high: 15,
    };

    const subtaskCount = task.requirements?.length || 0;
    const complexityMultiplier = {
      low: 1 + subtaskCount * 0.5,
      medium: 1 + subtaskCount * 0.8,
      high: 1 + subtaskCount,
    };

    return Math.ceil(baseSteps[complexity] * complexityMultiplier[complexity]);
  }

  private identifyDependencies(task: Task): string[] {
    const dependencies: string[] = [];
    const description = task.description.toLowerCase();

    const dependencyPatterns = [
      { pattern: /depends on (\w+)/gi, extractor: (match: string) => match[1] },
      { pattern: /requires (\w+)/gi, extractor: (match: string) => match[1] },
      { pattern: /after (\w+)/gi, extractor: (match: string) => match[1] },
      { pattern: /before (\w+)/gi, extractor: (match: string) => match[1] },
    ];

    for (const dp of dependencyPatterns) {
      let match;
      while ((match = dp.pattern.exec(description)) !== null) {
        const extracted = dp.extractor(match);
        if (extracted && !dependencies.includes(extracted)) {
          dependencies.push(extracted);
        }
      }
    }

    if (task.requirements) {
      for (const req of task.requirements) {
        const lowerReq = req.toLowerCase();
        if (lowerReq.includes('existing') || lowerReq.includes('current')) {
          dependencies.push('existing-code');
        }
        if (lowerReq.includes('api') || lowerReq.includes('service')) {
          dependencies.push('external-service');
        }
      }
    }

    return dependencies;
  }

  private async assessTaskRisks(task: Task): Promise<Risk[]> {
    const risks: Risk[] = [];
    const description = task.description.toLowerCase();
    const requirements = task.requirements || [];

    if (description.includes('delete') || description.includes('remove')) {
      risks.push({
        type: 'data-loss',
        probability: description.includes('confirm') ? 'low' : 'medium',
        impact: 'Permanent data loss if incorrect targets are selected',
        mitigation: 'Implement double-confirmation before execution and provide preview of affected files',
        severity: 'high',
      });
    }

    if (description.includes('database') || description.includes('migration')) {
      risks.push({
        type: 'data-corruption',
        probability: 'medium',
        impact: 'Potential data corruption or loss during schema changes',
        mitigation: 'Run migrations on backup data first, implement rollback plan',
        severity: 'critical',
      });
    }

    if (description.includes('deploy') || description.includes('production')) {
      risks.push({
        type: 'service-disruption',
        probability: 'medium',
        impact: 'Potential service downtime or degraded performance',
        mitigation: 'Implement blue-green deployment, have rollback strategy ready',
        severity: 'critical',
      });
    }

    if (requirements.some(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('auth'))) {
      risks.push({
        type: 'security-vulnerability',
        probability: 'medium',
        impact: 'Introduction of security vulnerabilities',
        mitigation: 'Conduct security review, use static analysis tools, follow secure coding practices',
        severity: 'high',
      });
    }

    if (description.includes('external') || description.includes('third-party')) {
      risks.push({
        type: 'dependency-failure',
        probability: 'medium',
        impact: 'Failure due to external service or dependency unavailability',
        mitigation: 'Implement fallback mechanisms, cache critical data, use circuit breakers',
        severity: 'medium',
      });
    }

    if (requirements.length > 5) {
      risks.push({
        type: 'scope-creep',
        probability: 'medium',
        impact: 'Task expanding beyond original requirements',
        mitigation: 'Prioritize requirements, implement strict scope boundaries',
        severity: 'low',
      });
    }

    return risks;
  }

  async refinePlan(draftPlan: DraftPlan): Promise<RefinedPlan> {
    const analysis = await this.analyzeTask({
      id: draftPlan.taskId,
      type: 'analysis',
      description: draftPlan.goals.join(' '),
      requirements: draftPlan.subtasks.map(s => s.description),
    });

    const researchTasks = this.createResearchTasks(draftPlan);
    const risks = this.assessRisks(draftPlan);

    let subtasks = this.convertToSubtasks(draftPlan);
    subtasks = this.optimizeTaskOrdering(subtasks);
    const parallelGroups = this.identifyParallelTasks({ ...draftPlan, subtasks } as RefinedPlan);
    subtasks = this.assignParallelGroups(subtasks, parallelGroups);

    const mitigations = risks.map(r => r.mitigation);

    const refinedPlan: RefinedPlan = {
      id: `plan-${++this.planCounter}`,
      taskId: draftPlan.taskId,
      analysis,
      subtasks,
      parallelGroups,
      researchTasks,
      risks,
      mitigations,
      metadata: {
        createdAt: new Date(),
        optimizedAt: new Date(),
        version: '1.0.0',
      },
    };

    this.activePlans.set(refinedPlan.id, refinedPlan);
    return refinedPlan;
  }

  private convertToSubtasks(draftPlan: DraftPlan): Subtask[] {
    return draftPlan.subtasks.map((subtask, index) => ({
      id: subtask.id || `subtask-${index + 1}`,
      agentType: subtask.agentType,
      description: subtask.description,
      prompt: this.generatePrompt(subtask, draftPlan),
      dependsOn: [...subtask.dependsOn],
      priority: this.calculatePriority(index, subtask),
      timeout: 300000,
      retries: 3,
    }));
  }

  private generatePrompt(subtask: DraftSubtask, draftPlan: DraftPlan): string {
    const context = draftPlan.goals.join('\n- ');
    return `Goal: ${subtask.description}

Context:
- Overall objectives: ${context}
- Task requirements: ${draftPlan.metadata?.requirements || 'None specified'}

Instructions:
1. Analyze the current state and requirements
2. Execute the task efficiently and safely
3. Report any issues or blockers
4. Ensure all changes are validated

Please complete this subtask: ${subtask.description}`;
  }

  private calculatePriority(index: number, subtask: DraftSubtask): number {
    let priority = 10 - index;

    if (subtask.dependsOn.length === 0) {
      priority += 5;
    }

    return Math.max(1, Math.min(10, priority));
  }

  private optimizeTaskOrdering(subtasks: Subtask[]): Subtask[] {
    const taskMap = new Map(subtasks.map(t => [t.id, t]));
    const resolved = new Set<string>();
    const ordered: Subtask[] = [];

    const getUnresolvedDependencies = (subtask: Subtask): string[] => {
      return subtask.dependsOn.filter(dep => !resolved.has(dep));
    };

    let progress = true;
    while (subtasks.length > ordered.length && progress) {
      progress = false;

      for (const subtask of subtasks) {
        if (resolved.has(subtask.id)) continue;

        const unresolved = getUnresolvedDependencies(subtask);
        if (unresolved.length === 0) {
          ordered.push(subtask);
          resolved.add(subtask.id);
          progress = true;
        }
      }
    }

    if (ordered.length < subtasks.length) {
      const unresolved = subtasks.filter(t => !resolved.has(t.id));
      ordered.push(...unresolved);
    }

    return ordered;
  }

  identifyParallelTasks(plan: RefinedPlan): Subtask[][] {
    const parallelGroups: Map<number, Subtask[]> = new Map();
    const processed = new Set<string>();

    const canRunInParallel = (subtask1: Subtask, subtask2: Subtask): boolean => {
      if (subtask1.dependsOn.includes(subtask2.id) || subtask2.dependsOn.includes(subtask1.id)) {
        return false;
      }

      if (subtask1.agentType !== subtask2.agentType) {
        return false;
      }

      return true;
    };

    let groupId = 0;
    for (const subtask of plan.subtasks) {
      if (processed.has(subtask.id)) continue;

      const currentGroup: Subtask[] = [subtask];
      processed.add(subtask.id);

      for (const other of plan.subtasks) {
        if (processed.has(other.id)) continue;

        if (canRunInParallel(subtask, other) && currentGroup.every(t => canRunInParallel(t, other))) {
          currentGroup.push(other);
          processed.add(other.id);
        }
      }

      if (currentGroup.length > 0) {
        parallelGroups.set(groupId++, currentGroup);
      }
    }

    return Array.from(parallelGroups.values());
  }

  private assignParallelGroups(subtasks: Subtask[], parallelGroups: Subtask[][]): Subtask[] {
    const groupMap = new Map<string, number>();

    parallelGroups.forEach((group, index) => {
      group.forEach(subtask => {
        groupMap.set(subtask.id, index);
      });
    });

    return subtasks.map(subtask => ({
      ...subtask,
      parallelGroup: groupMap.get(subtask.id),
    }));
  }

  async executeParallel(subtasks: Subtask[]): Promise<SubtaskResult[]> {
    const results: SubtaskResult[] = [];
    const startTime = Date.now();

    const executeSubtask = async (subtask: Subtask): Promise<SubtaskResult> => {
      const subtaskStart = Date.now();

      try {
        const result = await this.executeSubtaskInternal(subtask);

        return {
          subtaskId: subtask.id,
          success: true,
          result,
          metrics: {
            duration: Date.now() - subtaskStart,
          },
        };
      } catch (error) {
        return {
          subtaskId: subtask.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metrics: {
            duration: Date.now() - subtaskStart,
          },
        };
      }
    };

    const executionPromises = subtasks.map(executeSubtask);
    const executionResults = await Promise.all(executionPromises);

    results.push(...executionResults);

    const failed = executionResults.filter(r => !r.success);
    if (failed.length > 0) {
      console.warn(`Parallel execution completed with ${failed.length} failures`);
    }

    return results;
  }

  private async executeSubtaskInternal(subtask: Subtask): Promise<unknown> {
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: true,
      subtaskId: subtask.id,
      output: `Executed ${subtask.description}`,
    };
  }

  createResearchTasks(plan: DraftPlan): ResearchTask[] {
    const researchTasks: ResearchTask[] = [];
    const maxResearch = this.config.maxParallelResearch || 3;

    const researchTriggers = [
      { pattern: /new\s+framework|new\s+library|new\s+technology/gi, topic: 'framework-analysis' },
      { pattern: /best\s+practice|recommend|standard/gi, topic: 'best-practices' },
      { pattern: /api|interface|contract/gi, topic: 'api-documentation' },
      { pattern: /error|issue|problem/gi, topic: 'error-resolution' },
      { pattern: /performance|scalability|optimization/gi, topic: 'performance-analysis' },
    ];

    let taskIndex = 0;
    for (const goal of plan.goals) {
      for (const trigger of researchTriggers) {
        if (trigger.pattern.test(goal) && researchTasks.length < maxResearch) {
          researchTasks.push({
            id: `research-${++taskIndex}`,
            query: `Research: ${trigger.topic} for ${goal}`,
            subtaskId: plan.subtasks[0]?.id || 'root',
            priority: 5,
            sources: ['documentation', 'web-search'],
          });
        }
      }
    }

    if (researchTasks.length === 0) {
      researchTasks.push({
        id: 'research-general',
        query: `General research for: ${plan.goals.join(', ')}`,
        subtaskId: plan.subtasks[0]?.id || 'root',
        priority: 1,
      });
    }

    return researchTasks;
  }

  assessRisks(plan: DraftPlan): Risk[] {
    const risks: Risk[] = [];
    const allDescriptions = plan.subtasks.map(s => s.description).join(' ').toLowerCase();

    const riskPatterns = [
      {
        condition: () => plan.subtasks.length > 10,
        risk: {
          type: 'complex-execution',
          probability: 'high' as const,
          impact: 'High complexity increases chance of errors and coordination issues',
          mitigation: 'Break down into smaller phases with clear milestones',
          severity: 'medium' as const,
        },
      },
      {
        condition: () => allDescriptions.includes('delete') || allDescriptions.includes('remove'),
        risk: {
          type: 'destructive-operation',
          probability: 'medium' as const,
          impact: 'Potential irreversible data loss',
          mitigation: 'Implement safe deletion with backups and confirmations',
          severity: 'high' as const,
        },
      },
      {
        condition: () => plan.subtasks.some(s => s.dependsOn.length > 3),
        risk: {
          type: 'dependency-complexity',
          probability: 'medium' as const,
          impact: 'Complex dependencies increase failure cascade risk',
          mitigation: 'Add circuit breakers and fallback paths',
          severity: 'medium' as const,
        },
      },
      {
        condition: () => plan.subtasks.some(s => s.agentType !== s.dependsOn[0]),
        risk: {
          type: 'cross-agent-coordination',
          probability: 'low' as const,
          impact: 'Coordination issues between different agent types',
          mitigation: 'Implement clear communication protocols and state sharing',
          severity: 'low' as const,
        },
      },
    ];

    for (const pattern of riskPatterns) {
      if (pattern.condition()) {
        risks.push(pattern.risk);
      }
    }

    return risks;
  }

  generateRefinedPlan(analysis: AnalysisResult, subtasks: Subtask[]): RefinedPlan {
    const parallelGroups = this.identifyParallelTasks({ subtasks } as RefinedPlan);
    const subtasksWithGroups = this.assignParallelGroups(subtasks, parallelGroups);

    const refinedPlan: RefinedPlan = {
      id: `plan-${++this.planCounter}`,
      taskId: analysis.taskType,
      analysis,
      subtasks: subtasksWithGroups,
      parallelGroups,
      researchTasks: [],
      risks: analysis.risks,
      mitigations: analysis.risks.map(r => r.mitigation),
      metadata: {
        createdAt: new Date(),
        optimizedAt: new Date(),
        version: '1.0.0',
      },
    };

    this.activePlans.set(refinedPlan.id, refinedPlan);
    return refinedPlan;
  }

  async aggregateResearchFindings(results: SubtaskResult[]): Promise<Record<string, unknown>> {
    const findings: Record<string, unknown> = {
      summary: '',
      recommendations: [],
      references: [],
    };

    const successfulResults = results.filter(r => r.success);

    for (const result of successfulResults) {
      if (result.result && typeof result.result === 'object') {
        const resultObj = result.result as Record<string, unknown>;
        if (resultObj.findings) {
          if (Array.isArray(resultObj.findings)) {
            findings.recommendations.push(...(resultObj.findings as unknown[]));
          }
        }
        if (resultObj.summary) {
          findings.summary += `${resultObj.summary}\n`;
        }
      }
    }

    return findings;
  }

  getActivePlan(planId: string): RefinedPlan | undefined {
    return this.activePlans.get(planId);
  }

  completePlan(planId: string): void {
    this.activePlans.delete(planId);
  }
}
