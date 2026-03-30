export type AgentType = "file" | "research" | "code" | "system";

export interface AgentConfig {
  name: string;
  type: AgentType;
  description: string;
  capabilities: string[];
  maxIterations?: number;
  timeout?: number;
}

export interface AgentContext {
  cwd: string;
  files?: string[];
  data?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTask {
  id: string;
  agentType: AgentType;
  prompt: string;
  context?: AgentContext;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_outputs?: ToolOutput[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolOutput {
  tool_call_id: string;
  output: string;
}

export interface AgentState {
  messages: AgentMessage[];
  iterations: number;
  completed: boolean;
}

export interface BaseAgentInterface {
  config: AgentConfig;
  state: AgentState;
  execute(task: AgentTask): Promise<AgentResult>;
  loadContext(files: string[]): Promise<void>;
  reset(): void;
}
