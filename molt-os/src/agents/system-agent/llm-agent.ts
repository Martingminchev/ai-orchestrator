// LLM System Agent
// System agent that uses the AgentExecutor for LLM-based system operations

import type { ToolExecutor } from "../../tools/types.js";
import { LLMAgent, LLMAgentConfig } from "../llm-agent.js";
import { createSystemTools } from "../../orchestrator/tools/system-tools.js";

const DEFAULT_CONFIG: LLMAgentConfig = {
  name: "LLM System Agent",
  type: "system",
  description: "Handles system operations using LLM-guided tool calling",
  capabilities: [
    "Run shell commands safely",
    "Check environment variables",
    "Get system information",
    "Check running processes",
    "Locate executables",
  ],
  maxIterations: 20,
  timeout: 60000,
};

export class LLMSystemAgent extends LLMAgent {
  private cwd: string;

  constructor(cwd?: string, config?: Partial<LLMAgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.cwd = cwd || process.cwd();
  }

  getTools(): ToolExecutor[] {
    return createSystemTools(this.cwd);
  }

  protected getSystemPrompt(task: any): string {
    return `${super.getSystemPrompt(task)}

## System Operation Guidelines
- Some dangerous commands are blocked for safety
- Commands have a timeout limit
- Check command availability before running complex scripts
- Handle command failures gracefully
- Be mindful of side effects

## Safety Restrictions
- Commands like rm, shutdown, kill are blocked
- Redirect operators (>, >>) are not allowed
- Use file tools for file operations instead of shell redirects

## Working Directory
${this.cwd}
`;
  }
}

export function createLLMSystemAgent(cwd?: string, config?: Partial<LLMAgentConfig>): LLMSystemAgent {
  return new LLMSystemAgent(cwd, config);
}
