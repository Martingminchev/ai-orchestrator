// Research Tools - Tool implementations for research operations
// Used by the research agent for information gathering

import type { ToolExecutor, ToolInput, ToolOutput, ToolDefinition } from "../../tools/types.js";

class ThinkTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "think",
      description: "Think through a problem step by step. Use this to reason about complex questions.",
      inputSchema: {
        type: "object",
        properties: {
          thought: { type: "string", description: "Your thought process or reasoning" },
        },
        required: ["thought"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.thought || typeof input.thought !== "string") {
      errors.push("thought is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    return {
      success: true,
      result: {
        thought: input.thought,
        message: "Thinking recorded. Continue with your analysis.",
      },
    };
  }
}

class NoteTool implements ToolExecutor {
  private notes: Map<string, string[]> = new Map();

  getDefinition(): ToolDefinition {
    return {
      name: "note",
      description: "Record notes and findings for later reference",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic or category for the note" },
          content: { type: "string", description: "The note content" },
        },
        required: ["topic", "content"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.topic || typeof input.topic !== "string") {
      errors.push("topic is required and must be a string");
    }
    if (!input.content || typeof input.content !== "string") {
      errors.push("content is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const topic = input.topic as string;
    const content = input.content as string;

    if (!this.notes.has(topic)) {
      this.notes.set(topic, []);
    }
    this.notes.get(topic)!.push(content);

    return {
      success: true,
      result: {
        topic,
        noteCount: this.notes.get(topic)!.length,
        message: "Note recorded successfully.",
      },
    };
  }
}

class SummarizeTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "summarize",
      description: "Create a summary of findings or information",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title for the summary" },
          points: { type: "array", description: "Key points to include in the summary" },
          conclusion: { type: "string", description: "Overall conclusion (optional)" },
        },
        required: ["title", "points"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.title || typeof input.title !== "string") {
      errors.push("title is required and must be a string");
    }
    if (!Array.isArray(input.points)) {
      errors.push("points is required and must be an array");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const title = input.title as string;
    const points = input.points as string[];
    const conclusion = input.conclusion as string | undefined;

    const summary = {
      title,
      points,
      conclusion,
      formatted: `# ${title}\n\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}${conclusion ? `\n\n**Conclusion:** ${conclusion}` : ""}`,
    };

    return { success: true, result: summary };
  }
}

class CompareTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "compare",
      description: "Compare multiple options or items",
      inputSchema: {
        type: "object",
        properties: {
          items: { type: "array", description: "Items to compare (strings)" },
          criteria: { type: "array", description: "Criteria for comparison (strings)" },
          analysis: { type: "string", description: "Your comparative analysis" },
        },
        required: ["items", "criteria", "analysis"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!Array.isArray(input.items) || input.items.length < 2) {
      errors.push("items is required and must be an array with at least 2 items");
    }
    if (!Array.isArray(input.criteria)) {
      errors.push("criteria is required and must be an array");
    }
    if (!input.analysis || typeof input.analysis !== "string") {
      errors.push("analysis is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const items = input.items as string[];
    const criteria = input.criteria as string[];
    const analysis = input.analysis as string;

    return {
      success: true,
      result: {
        items,
        criteria,
        analysis,
        itemCount: items.length,
        criteriaCount: criteria.length,
      },
    };
  }
}

class RecommendTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "recommend",
      description: "Make a recommendation based on research and analysis",
      inputSchema: {
        type: "object",
        properties: {
          recommendation: { type: "string", description: "Your recommendation" },
          reasoning: { type: "string", description: "Reasoning behind the recommendation" },
          alternatives: { type: "array", description: "Alternative options considered (optional)" },
          caveats: { type: "array", description: "Caveats or conditions (optional)" },
        },
        required: ["recommendation", "reasoning"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.recommendation || typeof input.recommendation !== "string") {
      errors.push("recommendation is required and must be a string");
    }
    if (!input.reasoning || typeof input.reasoning !== "string") {
      errors.push("reasoning is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    return {
      success: true,
      result: {
        recommendation: input.recommendation,
        reasoning: input.reasoning,
        alternatives: input.alternatives || [],
        caveats: input.caveats || [],
      },
    };
  }
}

class AnswerTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "answer",
      description: "Provide a final answer to the research question",
      inputSchema: {
        type: "object",
        properties: {
          answer: { type: "string", description: "The answer to the question" },
          confidence: { type: "string", description: "Confidence level: high, medium, or low" },
          sources: { type: "array", description: "Sources or evidence supporting the answer (optional)" },
        },
        required: ["answer", "confidence"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.answer || typeof input.answer !== "string") {
      errors.push("answer is required and must be a string");
    }
    if (!["high", "medium", "low"].includes(input.confidence as string)) {
      errors.push("confidence must be one of: high, medium, low");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    return {
      success: true,
      result: {
        answer: input.answer,
        confidence: input.confidence,
        sources: input.sources || [],
      },
    };
  }
}

/**
 * Create all research tools
 */
export function createResearchTools(): ToolExecutor[] {
  return [
    new ThinkTool(),
    new NoteTool(),
    new SummarizeTool(),
    new CompareTool(),
    new RecommendTool(),
    new AnswerTool(),
  ];
}
