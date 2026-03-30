import type { AgentType, AgentConfig, AgentTask, AgentResult } from "./types.js";
import { FileAgent } from "./file-agent/index.js";
import { ResearchAgent } from "./research-agent/index.js";
import { CodeAgent } from "./code-agent/index.js";
import { SystemAgent } from "./system-agent/index.js";
import { BaseAgent } from "./base.js";

interface AgentRegistryEntry {
  config: AgentConfig;
  factory: () => BaseAgent;
}

const AGENT_REGISTRY: Map<AgentType, AgentRegistryEntry> = new Map();

function registerAgent(type: AgentType, config: AgentConfig, factory: () => BaseAgent): void {
  AGENT_REGISTRY.set(type, { config, factory });
}

registerAgent(
  "file",
  {
    name: "File Agent",
    type: "file",
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
  },
  () => new FileAgent(),
);

registerAgent(
  "research",
  {
    name: "Research Agent",
    type: "research",
    description: "Handles web research and information gathering operations",
    capabilities: [
      "Search the web for information",
      "Fetch and parse web pages",
      "Generate concise summaries",
      "Extract and categorize links",
      "Find specific information within content",
    ],
  },
  () => new ResearchAgent(),
);

registerAgent(
  "code",
  {
    name: "Code Agent",
    type: "code",
    description: "Handles code analysis, editing, refactoring, and generation operations",
    capabilities: [
      "Read and analyze source code",
      "Make targeted code edits",
      "Refactor code for better quality",
      "Find patterns and anti-patterns",
      "Perform static code analysis",
      "Generate new code from specifications",
      "Run test suites",
      "Run linters and fix issues",
    ],
  },
  () => new CodeAgent(),
);

registerAgent(
  "system",
  {
    name: "System Agent",
    type: "system",
    description:
      "Handles system operations including command execution, resource monitoring, and task automation",
    capabilities: [
      "Run shell commands with proper environment handling",
      "Execute scripts in various languages",
      "Check system and service status",
      "Monitor CPU, memory, disk, and network usage",
      "Automate repetitive system tasks",
      "Schedule jobs for future execution",
    ],
  },
  () => new SystemAgent(),
);

export function getAgentConfig(type: AgentType): AgentConfig | undefined {
  return AGENT_REGISTRY.get(type)?.config;
}

export function getAgent(type: AgentType): BaseAgent | undefined {
  const entry = AGENT_REGISTRY.get(type);
  if (entry) {
    return entry.factory();
  }
  return undefined;
}

export function listAgentTypes(): AgentType[] {
  return Array.from(AGENT_REGISTRY.keys());
}

export function listAgentConfigs(): AgentConfig[] {
  return Array.from(AGENT_REGISTRY.values()).map((entry) => entry.config);
}

export function isRegisteredAgent(type: string): type is AgentType {
  return AGENT_REGISTRY.has(type as AgentType);
}

export function registerCustomAgent(
  type: string,
  config: AgentConfig,
  factory: () => BaseAgent,
): boolean {
  if (AGENT_REGISTRY.has(type as AgentType)) {
    return false;
  }

  AGENT_REGISTRY.set(type as AgentType, { config, factory });
  return true;
}

export async function executeAgent(agentType: AgentType, task: AgentTask): Promise<AgentResult> {
  const agent = getAgent(agentType);

  if (!agent) {
    return {
      success: false,
      output: "",
      error: `Unknown agent type: ${agentType}`,
    };
  }

  if (task.context?.files && task.context.files.length > 0) {
    await agent.loadContext(task.context.files);
  }

  return agent.execute(task);
}

export { AGENT_REGISTRY };
