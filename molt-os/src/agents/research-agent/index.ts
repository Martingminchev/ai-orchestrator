import { BaseAgent } from "../base.js";
import type { AgentTask, AgentResult } from "../types.js";
import { webSearch, fetchPage, summarize, extractLinks, findInformation } from "./tools.js";

// Export LLM version
export { LLMResearchAgent, createLLMResearchAgent } from "./llm-agent.js";

const DEFAULT_CONFIG = {
  name: "Research Agent",
  type: "research" as const,
  description: "Handles web research and information gathering operations",
  capabilities: [
    "Search the web for information",
    "Fetch and parse web pages",
    "Generate concise summaries",
    "Extract and categorize links",
    "Find specific information within content",
  ],
  maxIterations: 50,
};

export class ResearchAgent extends BaseAgent {
  constructor() {
    super(DEFAULT_CONFIG);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.addSystemMessage(this.createSystemMessage());
    this.addUserMessage(task.prompt);

    const result = await this.processTask(task);
    return result;
  }

  private async processTask(task: AgentTask): Promise<AgentResult> {
    const prompt = task.prompt.toLowerCase();

    try {
      if (prompt.includes("search") || prompt.includes("find") || prompt.includes("look up")) {
        return await this.handleSearch(task);
      } else if (
        prompt.includes("fetch") ||
        prompt.includes("get") ||
        prompt.includes("retrieve")
      ) {
        return await this.handleFetch(task);
      } else if (prompt.includes("summarize") || prompt.includes("summary")) {
        return await this.handleSummarize(task);
      } else if (prompt.includes("extract") || prompt.includes("links")) {
        return await this.handleExtractLinks(task);
      } else if (prompt.includes("find") && prompt.includes("information")) {
        return await this.handleFindInfo(task);
      } else {
        return this.formatResult(false, "", `Unknown research operation: ${task.prompt}`);
      }
    } catch (error) {
      return this.formatResult(false, "", error instanceof Error ? error.message : "Unknown error");
    }
  }

  private async handleSearch(task: AgentTask): Promise<AgentResult> {
    const queryMatch = task.prompt.match(/(?:search|find|look up)[:\s]+["']?([^"'\n]+)["']?/i);
    const query = queryMatch?.[1] || this.extractQuery(task);

    if (!query) {
      return this.formatResult(false, "", "No search query provided");
    }

    const results = await webSearch({ query, numResults: 10, type: "general" });

    return this.formatResult(true, `Found ${results.length} results for "${query}"`, undefined, {
      query,
      results,
      count: results.length,
    });
  }

  private async handleFetch(task: AgentTask): Promise<AgentResult> {
    const urlMatch =
      task.prompt.match(/(?:fetch|get|retrieve)[:\s]+["']?([^"'\n]+)["']?/i) ||
      task.prompt.match(/https?:\/\/[^\s]+/);

    const url = urlMatch?.[1];

    if (!url) {
      return this.formatResult(false, "", "No URL provided");
    }

    const result = await fetchPage({ url, extractText: true });

    if (!result.success) {
      return this.formatResult(false, "", result.error);
    }

    return this.formatResult(true, `Successfully fetched ${url}`, undefined, {
      url,
      content: result.content,
      metadata: result.metadata,
    });
  }

  private async handleSummarize(task: AgentTask): Promise<AgentResult> {
    const lengthMatch = task.prompt.match(
      /summarize.*(?:as\s+(short|medium|long)|in\s+(short|medium|long))/i,
    );
    const length = (lengthMatch?.[1] as "short" | "medium" | "long") || "medium";

    const content = this.extractContent(task);

    if (!content) {
      return this.formatResult(false, "", "No content provided for summarization");
    }

    const summary = await summarize({ content, length });

    return this.formatResult(true, `Generated ${length} summary`, undefined, { summary, length });
  }

  private async handleExtractLinks(task: AgentTask): Promise<AgentResult> {
    const content = this.extractContent(task);

    if (!content) {
      return this.formatResult(false, "", "No content provided for link extraction");
    }

    const result = await extractLinks({ content });

    return this.formatResult(true, `Extracted ${result.links.length} links`, undefined, {
      links: result.links,
    });
  }

  private async handleFindInfo(task: AgentTask): Promise<AgentResult> {
    const queryMatch = task.prompt.match(
      /find\s+(?:information\s+)?(?:about|on)?[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const query = queryMatch?.[1];

    if (!query) {
      return this.formatResult(false, "", "No query provided");
    }

    const content = this.extractContent(task);

    if (!content) {
      return this.formatResult(false, "", "No content provided to search");
    }

    const result = await findInformation({ content, query, context: 100 });

    return this.formatResult(
      true,
      `Found ${result.matches.length} matches for "${query}"`,
      undefined,
      { query, matches: result.matches },
    );
  }

  private extractQuery(task: AgentTask): string {
    const patterns = [
      /(?:search|find|look up)[:\s]+["']?([^"'\n]+)["']?/i,
      /["']?([^"'\n]+)["']?(?:\?|!|$)/,
    ];

    for (const pattern of patterns) {
      const match = task.prompt.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return task.prompt;
  }

  private extractContent(task: AgentTask): string {
    const codeBlockMatch = task.prompt.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    const contentMatch = task.prompt.match(/content[:\s]+([\s\S]*)/i);
    if (contentMatch) {
      return contentMatch[1];
    }

    const urlContentMatch = task.prompt.match(/(https?:\/\/[^\s]+)[\s\S]*/);
    if (urlContentMatch) {
      return urlContentMatch[1];
    }

    return task.prompt;
  }
}

export default ResearchAgent;
