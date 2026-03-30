// LLM File Agent
// File agent that uses the AgentExecutor for LLM-based file operations

import type { ToolExecutor } from "../../tools/types.js";
import { LLMAgent, LLMAgentConfig } from "../llm-agent.js";
import { createFileTools } from "../../orchestrator/tools/file-tools.js";

const DEFAULT_CONFIG: LLMAgentConfig = {
  name: "LLM File Agent",
  type: "file",
  description: "Handles file system operations using LLM-guided tool calling",
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
  maxIterations: 30,
  timeout: 120000,
};

export class LLMFileAgent extends LLMAgent {
  private cwd: string;

  constructor(cwd?: string, config?: Partial<LLMAgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.cwd = cwd || process.cwd();
  }

  getTools(): ToolExecutor[] {
    return createFileTools(this.cwd);
  }

  protected getSystemPrompt(task: any): string {
    return `${super.getSystemPrompt(task)}

## File Operation Guidelines
- Always use absolute paths or paths relative to the working directory
- Check if files exist before reading
- Create parent directories when writing files
- Use glob patterns for searching (e.g., **/*.ts, src/**/*.js)
- Be careful with delete operations

## Working Directory
${this.cwd}
`;
  }
}

export function createLLMFileAgent(cwd?: string, config?: Partial<LLMAgentConfig>): LLMFileAgent {
  return new LLMFileAgent(cwd, config);
}
