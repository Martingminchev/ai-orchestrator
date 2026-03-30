// LLM Research Agent
// Research agent that uses the AgentExecutor for LLM-based research

import type { ToolExecutor } from "../../tools/types.js";
import { LLMAgent, LLMAgentConfig } from "../llm-agent.js";
import { createResearchTools } from "../../orchestrator/tools/research-tools.js";

const DEFAULT_CONFIG: LLMAgentConfig = {
  name: "LLM Research Agent",
  type: "research",
  description: "Handles research and analysis using LLM-guided reasoning",
  capabilities: [
    "Think through problems step by step",
    "Take notes on findings",
    "Compare options systematically",
    "Summarize information",
    "Make recommendations",
    "Provide answers with confidence levels",
  ],
  maxIterations: 30,
  timeout: 180000,
};

export class LLMResearchAgent extends LLMAgent {
  constructor(config?: Partial<LLMAgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  getTools(): ToolExecutor[] {
    return createResearchTools();
  }

  protected getSystemPrompt(task: any): string {
    return `${super.getSystemPrompt(task)}

## Research Guidelines
- Use the think tool to reason through complex problems
- Take notes on important findings
- Compare options systematically
- Consider multiple perspectives
- Be clear about uncertainty
- Provide actionable recommendations
- Cite sources when applicable
`;
  }
}

export function createLLMResearchAgent(config?: Partial<LLMAgentConfig>): LLMResearchAgent {
  return new LLMResearchAgent(config);
}
