import type {
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentState,
  AgentTask,
  AgentMessage,
  BaseAgentInterface,
} from "./types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export abstract class BaseAgent implements BaseAgentInterface {
  public config: AgentConfig;
  public state: AgentState;
  protected logger: Console;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = {
      messages: [],
      iterations: 0,
      completed: false,
    };
    this.logger = console;
  }

  abstract execute(task: AgentTask): Promise<AgentResult>;

  async loadContext(files: string[]): Promise<void> {
    const contextMessages: AgentMessage[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, "utf-8");
        contextMessages.push({
          role: "user",
          content: `Context file: ${file}\n\n${content}`,
        });
      } catch {
        this.logger.warn(`Could not read context file: ${file}`);
      }
    }

    this.state.messages = [...contextMessages, ...this.state.messages];
  }

  reset(): void {
    this.state = {
      messages: [],
      iterations: 0,
      completed: false,
    };
  }

  protected addMessage(message: AgentMessage): void {
    this.state.messages.push(message);
  }

  protected addUserMessage(content: string): void {
    this.addMessage({ role: "user", content });
  }

  protected addAssistantMessage(content: string): void {
    this.addMessage({ role: "assistant", content });
  }

  protected addSystemMessage(content: string): void {
    this.addMessage({ role: "system", content });
  }

  protected incrementIterations(): void {
    this.state.iterations++;
  }

  protected isWithinLimits(): boolean {
    const maxIterations = this.config.maxIterations ?? 100;
    return this.state.iterations < maxIterations;
  }

  protected async loadSkillInstructions(skillName: string): Promise<string> {
    const skillPath = join(__dirname, "..", "skills", skillName, "SKILL.md");

    if (existsSync(skillPath)) {
      return readFileSync(skillPath, "utf-8");
    }

    const agentDir = join(
      __dirname,
      "..",
      this.config.type === "file" ? "file-agent" : `${this.config.type}-agent`,
    );
    const agentSkillPath = join(agentDir, "SKILL.md");

    if (existsSync(agentSkillPath)) {
      return readFileSync(agentSkillPath, "utf-8");
    }

    return "";
  }

  protected createSystemMessage(): string {
    return `You are a ${this.config.name} agent.

## Description
${this.config.description}

## Capabilities
${this.config.capabilities.map((c) => `- ${c}`).join("\n")}

## Guidelines
- Execute tasks efficiently and safely
- Report errors clearly
- Return results in a structured format`;
  }

  protected formatResult(
    success: boolean,
    output: string,
    error?: string,
    metadata?: Record<string, unknown>,
  ): AgentResult {
    return {
      success,
      output,
      error,
      metadata: {
        ...metadata,
        agentType: this.config.type,
        agentName: this.config.name,
        iterations: this.state.iterations,
      },
    };
  }
}
