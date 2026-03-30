// LLM Code Agent
// Code agent that uses the AgentExecutor for LLM-based code operations

import type { ToolExecutor } from "../../tools/types.js";
import { LLMAgent, LLMAgentConfig } from "../llm-agent.js";
import { createCodeTools } from "../../orchestrator/tools/code-tools.js";

const DEFAULT_CONFIG: LLMAgentConfig = {
  name: "LLM Code Agent",
  type: "code",
  description: "Handles code analysis and generation using LLM-guided tool calling",
  capabilities: [
    "Read and analyze source code",
    "Write new code files",
    "Edit existing code with search and replace",
    "Search for patterns across files",
    "Analyze code structure (functions, classes, imports)",
    "Refactor code",
    "Fix bugs",
    "Add features",
  ],
  maxIterations: 50,
  timeout: 300000,
};

export class LLMCodeAgent extends LLMAgent {
  private cwd: string;

  constructor(cwd?: string, config?: Partial<LLMAgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.cwd = cwd || process.cwd();
  }

  getTools(): ToolExecutor[] {
    return createCodeTools(this.cwd);
  }

  protected getSystemPrompt(task: any): string {
    return `${super.getSystemPrompt(task)}

## Code Guidelines
- Follow existing code style and conventions
- Add comments for complex logic
- Keep functions focused and small
- Use meaningful variable and function names
- Handle errors gracefully
- Write clean, maintainable code

## Working Directory
${this.cwd}
`;
  }
}

export function createLLMCodeAgent(cwd?: string, config?: Partial<LLMAgentConfig>): LLMCodeAgent {
  return new LLMCodeAgent(cwd, config);
}
