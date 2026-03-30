import type {
  KimiClientOptions,
  KimiChatRequest,
  KimiChatResponse,
  KimiMessage,
  ToolDefinition,
  ToolCall,
  ChatWithToolsResult,
  ToolExecutionResult,
  LLMErrorCode,
} from "./types.js";
import { getLogger } from "../utils/logger.js";
import { getEnv } from "../utils/dotenv.js";

export class KimiClient {
  private apiKey: string;
  private model: string;
  private timeout: number;
  private baseUrl: string;
  private logger = getLogger();

  constructor(options: KimiClientOptions) {
    this.apiKey = options.apiKey || getEnv("KIMI_API_KEY", "");
    this.model = options.model || getEnv("KIMI_MODEL", "kimi-latest");
    this.timeout = options.timeout || 60000;
    // Support both international (moonshot.ai) and China (moonshot.cn) APIs
    this.baseUrl = options.baseUrl || getEnv("KIMI_BASE_URL", "https://api.moonshot.ai/v1");

    if (!this.apiKey) {
      throw new Error("KIMI_API_KEY is required");
    }
  }

  private classifyError(statusCode?: number): { code: LLMErrorCode; retryable: boolean; retryAfter?: number } {
    if (statusCode === 429) return { code: "RATE_LIMIT" as LLMErrorCode, retryable: true, retryAfter: 60000 };
    if (statusCode === 401 || statusCode === 403) return { code: "AUTHENTICATION" as LLMErrorCode, retryable: false };
    if (statusCode === 400) return { code: "INVALID_REQUEST" as LLMErrorCode, retryable: false };
    if (statusCode && statusCode >= 500) return { code: "SERVER_ERROR" as LLMErrorCode, retryable: true, retryAfter: 5000 };
    return { code: "UNKNOWN" as LLMErrorCode, retryable: false };
  }

  async chat(request: KimiChatRequest): Promise<KimiChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = { ...request, model: request.model || this.model, stream: false };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const errInfo = this.classifyError(response.status);
        const error = new Error(`Kimi API error: ${response.status} - ${errorText}`) as Error & { code: LLMErrorCode; retryable: boolean };
        error.code = errInfo.code;
        error.retryable = errInfo.retryable;
        throw error;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new Error(`Timeout after ${this.timeout}ms`) as Error & { code: LLMErrorCode; retryable: boolean };
        timeoutError.code = "TIMEOUT" as LLMErrorCode;
        timeoutError.retryable = true;
        throw timeoutError;
      }
      throw error;
    }
  }

  async chatWithTools(
    messages: KimiMessage[],
    tools?: ToolDefinition[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<ChatWithToolsResult> {
    const request: KimiChatRequest = {
      messages,
      model: this.model,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      tools,
      tool_choice: tools?.length ? "auto" : undefined,
    };

    const response = await this.chat(request);
    const choice = response.choices[0];

    if (!choice) throw new Error("No response choice");

    return {
      response,
      toolCalls: choice.message.tool_calls,
      content: choice.message.content ?? undefined,
      finishReason: choice.finish_reason,
      usage: response.usage,
    };
  }

  createToolResultMessages(results: ToolExecutionResult[]): KimiMessage[] {
    return results.map((r) => ({
      role: "tool" as const,
      content: r.error ? `Error: ${r.error}` : r.output,
      tool_call_id: r.tool_call_id,
    }));
  }

  async sendMessage(messages: KimiMessage[], temperature?: number): Promise<string> {
    const response = await this.chat({ messages, model: this.model, temperature });
    return response.choices[0]?.message.content || "";
  }

  setModel(model: string): void { this.model = model; }
  getModel(): string { return this.model; }
}

export function createKimiClient(options?: Partial<KimiClientOptions>): KimiClient {
  return new KimiClient({
    apiKey: options?.apiKey || getEnv("KIMI_API_KEY", ""),
    model: options?.model || getEnv("KIMI_MODEL", "kimi-latest"),
    timeout: options?.timeout,
    baseUrl: options?.baseUrl,
  });
}
