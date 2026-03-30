import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function KimiClient(options: {
  apiKey: string;
  model: string;
  timeout?: number;
  baseUrl?: string;
}) {
  const { KimiClient: _KimiClient } = await import("../../src/models/kimi.js");
  return new _KimiClient(options);
}

describe("Kimi Client", () => {
  let client: Awaited<ReturnType<typeof KimiClient>>;

  beforeEach(() => {
    client = null as unknown as Awaited<ReturnType<typeof KimiClient>>;
  });

  describe("constructor", () => {
    it("should create client with valid options", async () => {
      client = await KimiClient({
        apiKey: "test-api-key",
        model: "k2.5",
        timeout: 5000,
      });
      expect(client).toBeDefined();
    });

    it("should throw error when api key is missing", async () => {
      await expect(async () => {
        await KimiClient({
          apiKey: "",
          model: "k2.5",
        });
      }).rejects.toThrow("KIMI_API_KEY is required");
    });

    it("should use default model if not provided", async () => {
      client = await KimiClient({
        apiKey: "test-key",
        model: "k2.5",
      });
      expect(client.getModel()).toBe("k2.5");
    });

    it("should set custom model", async () => {
      client = await KimiClient({
        apiKey: "test-key",
        model: "k2.5",
      });
      client.setModel("moonshot-v1-8k");
      expect(client.getModel()).toBe("moonshot-v1-8k");
    });
  });

  describe("chat", () => {
    it("should return response structure", async () => {
      client = await KimiClient({
        apiKey: "test-api-key",
        model: "k2.5",
        timeout: 5000,
      });

      const mockResponse = {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        created: 1677858242,
        model: "k2.5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hello, I am Kimi!",
            },
            finishReason: "stop",
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      vi.stubGlobal("fetch", mockFetch);

      const response = await client.chat({
        messages: [{ role: "user", content: "Say hello" }],
        model: "k2.5",
      });

      expect(response.id).toBe("chatcmpl-abc123");
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.content).toBe("Hello, I am Kimi!");
      expect(response.usage.totalTokens).toBe(18);

      vi.unstubAllGlobals();
    });

    it("should handle API errors", async () => {
      client = await KimiClient({
        apiKey: "test-api-key",
        model: "k2.5",
        timeout: 5000,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      vi.stubGlobal("fetch", mockFetch);

      await expect(
        client.chat({
          messages: [{ role: "user", content: "Say hello" }],
          model: "k2.5",
        }),
      ).rejects.toThrow("Kimi API error: 401");

      vi.unstubAllGlobals();
    });
  });

  describe("sendMessage", () => {
    it("should send message and return content", async () => {
      client = await KimiClient({
        apiKey: "test-api-key",
        model: "k2.5",
        timeout: 5000,
      });

      const mockResponse = {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        created: 1677858242,
        model: "k2.5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Response content",
            },
            finishReason: "stop",
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      vi.stubGlobal("fetch", mockFetch);

      const content = await client.sendMessage([{ role: "user", content: "Hello" }]);

      expect(content).toBe("Response content");

      vi.unstubAllGlobals();
    });
  });
});
