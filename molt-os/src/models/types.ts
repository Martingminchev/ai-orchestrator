// LLM Message Types with Tool Calling Support

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

export interface ToolParameterSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  default?: unknown;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunction;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface KimiMessage {
  role: MessageRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface KimiChatRequest {
  messages: KimiMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface KimiChatChoice {
  index: number;
  message: KimiMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
}

export interface KimiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface KimiChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: KimiChatChoice[];
  usage: KimiUsage;
}

export interface KimiStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<KimiMessage>;
    finish_reason: "stop" | "tool_calls" | "length" | null;
  }>;
}

export interface KimiConfig {
  apiKey: string;
  model: string;
  timeout?: number;
  baseUrl?: string;
}

export interface KimiClientOptions extends KimiConfig {
  apiKey: string;
  model: string;
  timeout?: number;
  baseUrl?: string;
}

// Tool Execution Types
export interface ToolExecutionResult {
  tool_call_id: string;
  output: string;
  error?: string;
}

// Chat with Tools Response
export interface ChatWithToolsResult {
  response: KimiChatResponse;
  toolCalls?: ToolCall[];
  content?: string;
  finishReason: string | null;
  usage: KimiUsage;
}

// Streaming Types
export interface StreamingCallbacks {
  onContent?: (chunk: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onComplete?: (response: ChatWithToolsResult) => void;
  onError?: (error: Error) => void;
}

// Error Types
export interface LLMError extends Error {
  code: LLMErrorCode;
  statusCode?: number;
  retryable: boolean;
  retryAfter?: number;
}

export enum LLMErrorCode {
  RATE_LIMIT = "RATE_LIMIT",
  TIMEOUT = "TIMEOUT",
  INVALID_REQUEST = "INVALID_REQUEST",
  AUTHENTICATION = "AUTHENTICATION",
  SERVER_ERROR = "SERVER_ERROR",
  CONTEXT_LENGTH = "CONTEXT_LENGTH",
  CONTENT_FILTER = "CONTENT_FILTER",
  NETWORK = "NETWORK",
  UNKNOWN = "UNKNOWN",
}

// Token Estimation
export interface TokenEstimate {
  prompt: number;
  completion: number;
  total: number;
}

// Model Info
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

export const KIMI_MODELS: Record<string, ModelInfo> = {
  "moonshot-v1-8k": {
    id: "moonshot-v1-8k",
    name: "Moonshot V1 8K",
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
  },
  "moonshot-v1-32k": {
    id: "moonshot-v1-32k",
    name: "Moonshot V1 32K",
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  "moonshot-v1-128k": {
    id: "moonshot-v1-128k",
    name: "Moonshot V1 128K",
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsStreaming: true,
  },
  "k2.5": {
    id: "k2.5",
    name: "Kimi 2.5",
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsStreaming: true,
  },
};

export function getModelInfo(modelId: string): ModelInfo {
  return (
    KIMI_MODELS[modelId] ?? {
      id: modelId,
      name: modelId,
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
    }
  );
}
