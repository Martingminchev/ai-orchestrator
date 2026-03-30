export type ToolStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  success: boolean;
  result?: unknown;
  error?: string;
  metadata?: ToolMetadata;
}

export interface ToolMetadata {
  duration?: number;
  timestamp?: string;
  toolName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolOutputSchema;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

export interface ToolOutputSchema {
  type: "object";
  properties: Record<string, SchemaProperty>;
}

export interface SchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ToolExecutionContext {
  toolName: string;
  input: ToolInput;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ToolExecutor {
  execute(input: ToolInput): Promise<ToolOutput>;
  validate(input: ToolInput): { valid: boolean; errors: string[] };
  getDefinition(): ToolDefinition;
}

export interface ToolRegistry {
  register(tool: ToolExecutor): void;
  unregister(name: string): boolean;
  get(name: string): ToolExecutor | undefined;
  list(): ToolDefinition[];
  clear(): void;
}

export interface SandboxedTool extends ToolExecutor {
  setSandbox(enabled: boolean): void;
  isSandboxed(): boolean;
}

export type ToolResultHandler = (output: ToolOutput) => void;
export type ToolErrorHandler = (error: Error) => void;
