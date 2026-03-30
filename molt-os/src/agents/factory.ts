import type { AgentType, AgentConfig, AgentTask, AgentResult } from "./types.js";
import { BaseAgent } from "./base.js";
import { getAgent, listAgentTypes, listAgentConfigs, isRegisteredAgent } from "./registry.js";

export interface AgentFactoryOptions {
  defaultTimeout?: number;
  maxIterations?: number;
  enableLogging?: boolean;
}

export class AgentFactory {
  private options: AgentFactoryOptions;

  constructor(options: AgentFactoryOptions = {}) {
    this.options = {
      defaultTimeout: 60000,
      maxIterations: 100,
      enableLogging: true,
      ...options,
    };
  }

  create(agentType: AgentType): BaseAgent | undefined {
    const agent = getAgent(agentType);

    if (agent && this.options.maxIterations) {
      agent.config.maxIterations = this.options.maxIterations;
    }

    return agent;
  }

  createWithConfig(config: AgentConfig): BaseAgent | undefined {
    const agent = getAgent(config.type);

    if (agent) {
      agent.config = { ...agent.config, ...config };
    }

    return agent;
  }

  async execute(agentType: AgentType, task: AgentTask, timeout?: number): Promise<AgentResult> {
    const agent = this.create(agentType);

    if (!agent) {
      return {
        success: false,
        output: "",
        error: `Unknown agent type: ${agentType}`,
      };
    }

    const executionTimeout = timeout ?? this.options.defaultTimeout;

    return Promise.race([
      agent.execute(task),
      new Promise<AgentResult>((resolve) =>
        setTimeout(() => {
          resolve({
            success: false,
            output: "",
            error: `Execution timeout after ${executionTimeout}ms`,
          });
        }, executionTimeout),
      ),
    ]);
  }

  listAvailableAgents(): AgentType[] {
    return listAgentTypes();
  }

  listAgentDetails(): { type: AgentType; config: AgentConfig }[] {
    return listAgentConfigs().map((config) => ({
      type: config.type,
      config,
    }));
  }

  isValidAgentType(type: string): boolean {
    return isRegisteredAgent(type);
  }

  createAgentByName(name: string): BaseAgent | undefined {
    const normalizedName = name.toLowerCase().replace(/[-_\s]/g, "-");

    const agentType = this.listAvailableAgents().find(
      (type) => type.toLowerCase() === normalizedName,
    );

    if (agentType) {
      return this.create(agentType);
    }

    const details = this.listAgentDetails();
    const match = details.find(
      (d) => d.config.name.toLowerCase().replace(/[-_\s]/g, "-") === normalizedName,
    );

    if (match) {
      return this.create(match.type);
    }

    return undefined;
  }
}

export function createAgentFactory(options?: AgentFactoryOptions): AgentFactory {
  return new AgentFactory(options);
}

export default AgentFactory;
