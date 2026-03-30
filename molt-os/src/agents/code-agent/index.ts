import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, relative, basename, extname } from "path";
import { exec, execSync } from "child_process";
import { glob } from "glob";
import { promisify } from "util";
import { BaseAgent } from "../base.js";
import type { AgentTask, AgentResult } from "../types.js";
import {
  ReadCodeSchema,
  EditCodeSchema,
  RefactorCodeSchema,
  FindPatternsSchema,
  AnalyzeCodeSchema,
  GenerateCodeSchema,
  RunTestsSchema,
  LintCodeSchema,
} from "./tools.js";

const execAsync = promisify(exec);

const DEFAULT_CONFIG = {
  name: "Code Agent",
  type: "code" as const,
  description: "Handles code analysis, editing, refactoring, and generation operations",
  capabilities: [
    "Read and analyze source code",
    "Make targeted code edits",
    "Refactor code for better quality",
    "Find patterns and anti-patterns",
    "Perform static code analysis",
    "Generate new code from specifications",
    "Run test suites",
    "Run linters and fix issues",
  ],
  maxIterations: 50,
};

export class CodeAgent extends BaseAgent {
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
      if (prompt.includes("read") || prompt.includes("analyze")) {
        return await this.handleReadCode(task);
      } else if (
        prompt.includes("edit") ||
        prompt.includes("modify") ||
        prompt.includes("change")
      ) {
        return await this.handleEditCode(task);
      } else if (
        prompt.includes("refactor") ||
        prompt.includes("improve") ||
        prompt.includes("restructure")
      ) {
        return await this.handleRefactorCode(task);
      } else if (
        prompt.includes("find") ||
        prompt.includes("search") ||
        prompt.includes("pattern")
      ) {
        return await this.handleFindPatterns(task);
      } else if (
        prompt.includes("generate") ||
        prompt.includes("create") ||
        prompt.includes("write")
      ) {
        return await this.handleGenerateCode(task);
      } else if (prompt.includes("test") || prompt.includes("run")) {
        return await this.handleRunTests(task);
      } else if (prompt.includes("lint") || prompt.includes("format")) {
        return await this.handleLintCode(task);
      } else if (prompt.includes("analyze") || prompt.includes("review")) {
        return await this.handleAnalyzeCode(task);
      } else {
        return this.formatResult(false, "", `Unknown code operation: ${task.prompt}`);
      }
    } catch (error) {
      return this.formatResult(false, "", error instanceof Error ? error.message : "Unknown error");
    }
  }

  private async handleReadCode(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(/(?:read|analyze)[:\s]+["']?([^"'\n]+)["']?/i);
    const path = pathMatch?.[1] || this.extractPath(task);

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      return this.formatResult(false, "", `File not found: ${fullPath}`);
    }

    const content = readFileSync(fullPath, "utf-8");
    const language = this.detectLanguage(fullPath);

    return this.formatResult(true, `Successfully read ${fullPath}`, undefined, {
      path: fullPath,
      content,
      language,
    });
  }

  private async handleEditCode(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(/(?:edit|modify|change)[:\s]+["']?([^"'\n]+)["']?/i);
    const path = pathMatch?.[1] || this.extractPath(task);

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const oldCodeMatch =
      task.prompt.match(/old[:\s]+```[\w]*\n([\s\S]*?)\n```/i) ||
      task.prompt.match(/from[:\s]+([\s\S]*?)\s+to/i);
    const newCodeMatch =
      task.prompt.match(/new[:\s]+```[\w]*\n([\s\S]*?)\n```/i) ||
      task.prompt.match(/to[:\s]+([\s\S]*?)$/i);

    const oldCode = oldCodeMatch?.[1];
    const newCode = newCodeMatch?.[1];

    if (!oldCode || !newCode) {
      return this.formatResult(false, "", "Missing old or new code");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      return this.formatResult(false, "", `File not found: ${fullPath}`);
    }

    let content = readFileSync(fullPath, "utf-8");
    content = content.replace(oldCode, newCode);
    writeFileSync(fullPath, content, "utf-8");

    return this.formatResult(true, `Successfully edited ${fullPath}`, undefined, {
      path: fullPath,
    });
  }

  private async handleRefactorCode(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(
      /(?:refactor|improve|restructure)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const path = pathMatch?.[1] || this.extractPath(task);

    const typeMatch = task.prompt.match(
      /(?:to\s+)?(extract-function|rename|move|inline|simplify|optimize)/i,
    );
    const type =
      (typeMatch?.[1] as
        | "extract-function"
        | "rename"
        | "move"
        | "inline"
        | "simplify"
        | "optimize") || "simplify";

    const targetMatch = task.prompt.match(
      /(?:name|variable|function)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const target = targetMatch?.[1];

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      return this.formatResult(false, "", `File not found: ${fullPath}`);
    }

    const content = readFileSync(fullPath, "utf-8");
    const changes: Array<{ type: string; description: string; line?: number }> = [];
    let refactoredContent = content;

    switch (type) {
      case "extract-function": {
        const funcPattern =
          /(\/\/|\/\*)?(\s*)(function\s+(\w+)|const\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))/g;
        let match;
        const duplicates: Array<{ start: number; end: number; code: string }> = [];

        while ((match = funcPattern.exec(content)) !== null) {
          const funcStart = match.index;
          const funcEnd = this.findFunctionEnd(content, funcStart);
          if (funcEnd > funcStart) {
            const code = content.slice(funcStart, funcEnd);
            if (this.isSimpleGetter(code)) {
              duplicates.push({ start: funcStart, end: funcEnd, code });
            }
          }
        }

        if (duplicates.length > 0 && target) {
          const extractedFunc = this.extractFunction(duplicates[0].code, target);
          refactoredContent = this.applyExtraction(
            content,
            duplicates,
            extractedFunc,
          );
          changes.push({
            type: "extract-function",
            description: `Extracted duplicate code to function: ${target}`,
            line: 1,
          });
        }
        break;
      }
      case "rename": {
        if (target) {
          const nameMatch = task.prompt.match(/to[:\s]+["']?([^"'\n]+)["']?/i);
          const newName = nameMatch?.[1];
          if (newName) {
            refactoredContent = this.renameSymbol(content, target, newName);
            changes.push({
              type: "rename",
              description: `Renamed ${target} to ${newName}`,
              line: 1,
            });
          }
        }
        break;
      }
      case "inline": {
        const inlineMatch = task.prompt.match(
          /inline[:\s]+["']?([^"'\n]+)["']?/i,
        );
        const funcName = inlineMatch?.[1] || target;
        if (funcName) {
          refactoredContent = this.inlineFunction(content, funcName);
          changes.push({
            type: "inline",
            description: `Inlined function: ${funcName}`,
            line: 1,
          });
        }
        break;
      }
      case "simplify": {
        const beforeLength = content.length;
        refactoredContent = this.simplifyCode(content);
        changes.push({
          type: "simplify",
          description: `Simplified code (reduced from ${beforeLength} to ${refactoredContent.length} chars)`,
          line: 1,
        });
        break;
      }
      case "optimize": {
        const beforeLength = content.length;
        refactoredContent = this.optimizeCode(content);
        changes.push({
          type: "optimize",
          description: `Optimized code (reduced from ${beforeLength} to ${refactoredContent.length} chars)`,
          line: 1,
        });
        break;
      }
    }

    if (refactoredContent !== content) {
      writeFileSync(fullPath, refactoredContent, "utf-8");
    }

    return this.formatResult(
      true,
      `Refactored ${fullPath} using ${type} pattern`,
      undefined,
      { path: fullPath, type, changes },
    );
  }

  private findFunctionEnd(content: string, start: number): number {
    let braceCount = 0;
    let parenCount = 0;
    let inString = false;
    let stringChar = "";
    let i = start;

    while (i < content.length) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : "";

      if (inString) {
        if (char === stringChar && prevChar !== "\\") {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'" || char === "`") {
          inString = true;
          stringChar = char;
        } else if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            return i + 1;
          }
        } else if (char === "(") {
          parenCount++;
        } else if (char === ")") {
          parenCount--;
        }
      }
      i++;
    }
    return i;
  }

  private isSimpleGetter(code: string): boolean {
    const patterns = [
      /return\s+this\.\w+;/,
      /return\s+\w+\.\w+;/,
      /this\.\w+\s*=\s*\w+;/,
    ];
    return patterns.some((p) => p.test(code));
  }

  private extractFunction(code: string, name: string): string {
    const cleaned = code.trim();
    const paramsMatch = cleaned.match(/\(([^)]*)\)/);
    const params = paramsMatch?.[1] || "";
    const bodyMatch =
      cleaned.match(/{([^}]*)}/s) ||
      cleaned.match(/=>\s*{?\s*([\s\S]*?)\s*}?\s*$/);
    const body = bodyMatch?.[1] || cleaned;
    return `function ${name}(${params}) {\n${this.indent(body)}\n}`;
  }

  private applyExtraction(
    content: string,
    duplicates: Array<{ start: number; end: number; code: string }>,
    newFunc: string,
  ): string {
    let result = content;
    const first = duplicates[0];
    const beforeFirst = content.slice(0, first.start);
    const afterFirst = content.slice(first.end);
    result = beforeFirst + `\n${newFunc}\n` + afterFirst;
    const funcName = newFunc.match(/function\s+(\w+)/)?.[1] || "extracted";
    for (let i = 1; i < duplicates.length; i++) {
      const d = duplicates[i];
      const offset =
        i * (first.end - first.start) +
        (i > 1 ? (i - 1) * newFunc.length : 0);
      const replacement = `${funcName}()`;
      result =
        result.slice(0, d.start - offset) +
        replacement +
        result.slice(d.end - offset);
    }
    return result;
  }

  private renameSymbol(
    content: string,
    oldName: string,
    newName: string,
  ): string {
    const pattern = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, "g");
    return content.replace(pattern, newName);
  }

  private inlineFunction(content: string, funcName: string): string {
    const funcPattern = new RegExp(
      `function\\s+${escapeRegExp(funcName)}\\s*\\([^)]*\\)\\s*{([^}]*)}`,
      "s",
    );
    const match = content.match(funcPattern);
    if (!match) return content;
    const funcBody = match[1].trim();
    const callPattern = new RegExp(
      `${escapeRegExp(funcName)}\\s*\\(\\s*\\)`,
      "g",
    );
    return content.replace(funcPattern, "").replace(callPattern, funcBody);
  }

  private simplifyCode(content: string): string {
    return content
      .replace(/\s+/g, " ")
      .replace(/\s*([{}()[\],;:=<>!+\-*/%])\s*/g, "$1")
      .replace(/const\s+(\w+)\s*=\s*\1\s*/g, "const $1 = $1")
      .replace(/if\s*\(\s*true\s*\)\s*/gi, "")
      .replace(/if\s*\(\s*false\s*\)\s*/gi, "");
  }

  private optimizeCode(content: string): string {
    return content
      .replace(
        /for\s*\(\s*let\s+(\w+)\s*=\s*0;\s*\1\s*<\s*(\w+)\.length;\s*\1\+\+\s*\)/g,
        "for (let $1 = 0; $1 < $2.length; $1++)",
      )
      .replace(/Array\.from\(([^)]+)\)\.forEach/g, "$1.forEach")
      .replace(
        /Object\.keys\(([^)]+)\)\.map\(([^)]+)=>\s*\1\[$2\]\)/g,
        "Object.values($1)",
      )
      .replace(/console\.log\(/g, "console.info(");
  }

  private indent(code: string): string {
    return code.split("\n").map((line) => "  " + line).join("\n");
  }

  private async handleFindPatterns(task: AgentTask): Promise<AgentResult> {
    const patternMatch = task.prompt.match(
      /(?:find|search)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    let pattern = patternMatch?.[1];

    if (!pattern) {
      return this.formatResult(false, "", "No pattern provided");
    }

    const cwd = task.context?.cwd || process.cwd();
    const pathMatch = task.prompt.match(
      /(?:in|dir|directory|path)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const searchDir = pathMatch?.[1] ? this.resolvePath(pathMatch[1], cwd) : cwd;

    const recursiveMatch = task.prompt.match(
      /recursive[:\s]+(true|false|y|n|yes|no)/i,
    );
    const recursive = recursiveMatch
      ? ["true", "y", "yes"].includes(recursiveMatch[1].toLowerCase())
      : true;

    const extMatch = task.prompt.match(
      /(?:ext|extension|type)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const extensions = extMatch?.[1]
      ? extMatch[1].split(",").map((e) => e.trim().replace(/^\./, ""))
      : ["ts", "tsx", "js", "jsx", "py", "rs", "go", "java"];

    const matches: Array<{
      file: string;
      line: number;
      column: number;
      match: string;
      context: string;
    }> = [];

    try {
      let globPattern = "**/*";
      if (extensions.length > 0) {
        globPattern = `**/*.{${extensions.join(",")}}`;
      }

      const files = await glob(globPattern, {
        cwd: searchDir,
        absolute: true,
        recursive: recursive,
      });

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch {
        regex = new RegExp(escapeRegExp(pattern), "g");
      }

      for (const file of files) {
        if (!existsSync(file) || statSync(file).isDirectory()) continue;

        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineMatches = line.match(regex);
          if (lineMatches) {
            for (const m of lineMatches) {
              const column = line.indexOf(m);
              matches.push({
                file: relative(cwd, file),
                line: i + 1,
                column: column + 1,
                match: m,
                context: line.trim(),
              });
            }
          }
        }
      }
    } catch (error) {
      return this.formatResult(
        false,
        "",
        error instanceof Error ? error.message : "Search failed",
      );
    }

    return this.formatResult(
      true,
      `Found ${matches.length} matches for pattern "${pattern}"`,
      undefined,
      { pattern, matches, count: matches.length, searchDir },
    );
  }

  private async handleGenerateCode(task: AgentTask): Promise<AgentResult> {
    const specMatch = task.prompt.match(/(?:generate|create)[:\s]+([\s\S]*)/i);
    const specification = specMatch?.[1] || task.prompt;

    const languageMatch = task.prompt.match(
      /in\s+(typescript|javascript|python|rust|go|java|tsx|jsx)/i,
    );
    const language =
      (languageMatch?.[1]?.toLowerCase() as string) || "typescript";

    const outputPathMatch = task.prompt.match(
      /(?:to|output|file)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const outputPath = outputPathMatch?.[1];

    let code = "";

    const kimiApiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (kimiApiKey) {
      try {
        code = await this.generateCodeWithKimi(specification, language, kimiApiKey);
      } catch {
        code = this.generateFallbackCode(specification, language);
      }
    } else {
      code = this.generateFallbackCode(specification, language);
    }

    if (outputPath) {
      const fullPath = this.resolvePath(outputPath, task.context?.cwd);
      const dir = fullPath.replace(/[^/\\]+$/, "");
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, code, "utf-8");
    }

    return this.formatResult(true, `Generated ${language} code`, undefined, {
      specification,
      language,
      code,
      outputPath,
    });
  }

  private async generateCodeWithKimi(
    specification: string,
    language: string,
    apiKey: string,
  ): Promise<string> {
    const endpoint = process.env.KIMI_API_URL || "https://api.moonshot.cn/v1/chat/completions";

    const prompt = `Generate ${language} code based on this specification:\n${specification}\n\nReturn only the code without any markdown formatting or explanations.`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        messages: [
          {
            role: "system",
            content: `You are an expert ${language} developer. Generate clean, well-structured code.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Kimi API error: ${response.statusText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    let generated = data.choices[0]?.message?.content || "";

    generated = generated.replace(/^```[\w]*\n?/g, "").replace(/\n?```$/g, "");

    return generated.trim();
  }

  private generateFallbackCode(specification: string, language: string): string {
    const specs = specification.toLowerCase();

    const templates: Record<string, (spec: string) => string> = {
      typescript: (spec: string) => {
        const classMatch = spec.match(/class\s+(\w+)/i);
        const funcMatch = spec.match(/function\s+(\w+)/i);
        const name = classMatch?.[1] || funcMatch?.[1] || "Example";

        if (spec.includes("api") || spec.includes("http") || spec.includes("endpoint")) {
          return `interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

class ${name}Service {
  private baseUrl: string;

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return response.json();
  }

  async post<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return response.json();
  }
}

export default ${name}Service;
export type { ApiResponse };`;
        }

        if (spec.includes("component") || spec.includes("react")) {
          return `import React, { useState, useEffect } from "react";

interface ${name}Props {
  initialValue?: string;
  onChange?: (value: string) => void;
}

export function ${name}({ initialValue = "", onChange }: ${name}Props): JSX.Element {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    onChange?.(value);
  }, [value, onChange]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setValue(event.target.value);
  };

  return (
    <div className="${name.toLowerCase()}">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Enter value..."
      />
    </div>
  );
}

export default ${name};`;
        }

        return `/**
 * ${name}
 * Generated from: ${spec}
 */

export interface ${name}Config {
  enabled: boolean;
  maxRetries?: number;
  timeout?: number;
}

export class ${name} {
  private config: ${name}Config;
  private initialized: boolean = false;

  constructor(config: ${name}Config) {
    this.config = {
      maxRetries: 3,
      timeout: 5000,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.setup();
    this.initialized = true;
  }

  private async setup(): Promise<void> {
    console.log(\`Initializing \${${name}.name}...\`);
  }

  async execute(input: unknown): Promise<unknown> {
    await this.initialize();
    return this.process(input);
  }

  protected process(input: unknown): unknown {
    return input;
  }
}

export default ${name};`;
      },
      javascript: (spec: string) => {
        const name = spec.match(/function\s+(\w+)/i)?.[1] || "Example";

        return `/**
 * ${name}
 * Generated from: ${spec}
 */

export class ${name} {
  constructor(options = {}) {
    this.options = { ...options };
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await this.setup();
    this.initialized = true;
  }

  async setup() {
    console.log(\`Setting up \${${name}.name}...\`);
  }

  async execute(input) {
    await this.init();
    return this.process(input);
  }

  process(input) {
    return input;
  }
}

export default ${name};`;
      },
      python: (spec: string) => {
        const classMatch = spec.match(/class\s+(\w+)/i);
        const funcMatch = spec.match(/def\s+(\w+)/i);
        const name = classMatch?.[1] || funcMatch?.[1] || "Example";

        if (spec.includes("api") || spec.includes("http")) {
          return `from typing import Any, Dict, Optional
import requests

class ${name}:
    """${spec}"""

    def __init__(self, base_url: str = "/api"):
        self.base_url = base_url
        self.session = requests.Session()

    def get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        """GET request"""
        response = self.session.get(
            f"{self.base_url}{endpoint}",
            params=params
        )
        response.raise_for_status()
        return response.json()

    def post(self, endpoint: str, data: Any = None) -> Any:
        """POST request"""
        response = self.session.post(
            f"{self.base_url}{endpoint}",
            json=data
        )
        response.raise_for_status()
        return response.json()

if __name__ == "__main__":
    ${name.toLowerCase()} = ${name}()`;
        }

        return `"""${spec}"""

from typing import Any, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class ${name}:
    """Generated from: ${spec}"""

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self._initialized = False

    def initialize(self) -> None:
        """Initialize the ${name}"""
        if self._initialized:
            return
        self._setup()
        self._initialized = True

    def _setup(self) -> None:
        """Internal setup method"""
        logger.info(f"Setting up {self.__class__.__name__}")

    def execute(self, input_data: Any) -> Any:
        """Execute the main logic"""
        self.initialize()
        return self._process(input_data)

    def _process(self, input_data: Any) -> Any:
        """Process input data"""
        return input_data


if __name__ == "__main__":
    instance = ${name}()
    result = instance.execute({})`;
      },
      rust: (spec: string) => {
        const name = spec.match(/struct\s+(\w+)/i)?.[1] || "Example";

        return `// ${spec}

#[derive(Debug)]
pub struct ${name} {
    // Add fields here
}

impl ${name} {
    pub fn new() -> Self {
        Self {
            // Initialize fields
        }
    }

    pub fn execute(&self, input: &str) -> String {
        // Process input and return result
        input.to_string()
    }
}

impl Default for ${name} {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute() {
        let instance = ${name}::new();
        let result = instance.execute("test");
        assert!(!result.is_empty());
    }
}`;
      },
      go: (spec: string) => {
        const name = spec.match(/func\s+(\w+)/i)?.[1] || "Example";

        return `// ${spec}

package main

import (
	"fmt"
)

// ${name} handles the main logic
func ${name}(input string) string {
	return input
}

func main() {
	result := ${name}("example")
	fmt.Println(result)
}`;
      },
      java: (spec: string) => {
        const name = spec.match(/class\s+(\w+)/i)?.[1] || "Example";

        return `// ${spec}

public class ${name} {
    private String field;

    public ${name}() {
        this.field = "";
    }

    public ${name}(String field) {
        this.field = field;
    }

    public String execute(String input) {
        return input;
    }

    public static void main(String[] args) {
        ${name} instance = new ${name}();
        String result = instance.execute("example");
        System.out.println(result);
    }
}`;
      },
    };

    const generator = templates[language] || templates.typescript;
    return generator(specs);
  }

  private async handleRunTests(task: AgentTask): Promise<AgentResult> {
    const patternMatch = task.prompt.match(
      /(?:run|execute)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const pattern = patternMatch?.[1];

    const cwd = task.context?.cwd || process.cwd();

    let command = "";
    let passed = 0;
    let failed = 0;
    const failures: Array<{
      name: string;
      message: string;
      stack?: string;
    }> = [];
    const output: string[] = [];

    try {
      const packageJsonPath = join(cwd, "package.json");
      const pyprojectPath = join(cwd, "pyproject.toml");
      const cargoPath = join(cwd, "Cargo.toml");

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          readFileSync(packageJsonPath, "utf-8"),
        );
        if (pattern) {
          command = `npm test -- --testPathPattern="${pattern}"`;
        } else if (packageJson.scripts?.test) {
          command = "npm test";
        } else if (packageJson.scripts?.test) {
          command = "pnpm test";
        } else if (packageJson.scripts?.test) {
          command = "yarn test";
        } else {
          command = "npm test";
        }
      } else if (existsSync(pyprojectPath)) {
        command = pattern
          ? `python -m pytest -k "${pattern}"`
          : "python -m pytest";
      } else if (existsSync(cargoPath)) {
        command = pattern
          ? `cargo test -- "${pattern}"`
          : "cargo test";
      } else if (pattern) {
        command = `npx vitest run --testNamePattern="${pattern}"`;
      } else {
        command = "npx vitest run";
      }

      output.push(`Running: ${command}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: 120000,
        encoding: "utf-8",
      });

      output.push(stdout);
      if (stderr) output.push(stderr);

      const vitestMatch = stdout.match(
        /Tests:\s*(\d+)\s+passed,\s*(\d+)\s+failed/,
      );
      const jestMatch = stdout.match(
        /Tests:\s*.*?(\d+)\s+passed.*?(\d+)\s+failed/s,
      );
      const pytestMatch = stdout.match(
        /(\d+)\s+passed.*?(\d+)\s+failed/,
      );
      const cargoMatch = stdout.match(/test\s+result:\s*.*?(\d+)\s+passed.*?(\d+)\s+failed/s);

      if (vitestMatch) {
        passed = parseInt(vitestMatch[1], 10);
        failed = parseInt(vitestMatch[2], 10);
      } else if (jestMatch) {
        passed = parseInt(jestMatch[1], 10);
        failed = parseInt(jestMatch[2], 10);
      } else if (pytestMatch) {
        passed = parseInt(pytestMatch[1], 10);
        failed = parseInt(pytestMatch[2], 10);
      } else if (cargoMatch) {
        passed = parseInt(cargoMatch[1], 10);
        failed = parseInt(cargoMatch[2], 10);
      } else {
        const passMatch = stdout.match(/(\d+)\s+passed/i);
        const failMatch = stdout.match(/(\d+)\s+failed/i);
        if (passMatch) passed = parseInt(passMatch[1], 10);
        if (failMatch) failed = parseInt(failMatch[1], 10);
      }

      const failureBlockRegex = /FAIL\s+(.*?)\n\s+(.*?)(?=\n\s*(?:PASS|FAIL|$))/gs;
      let match;
      while ((match = failureBlockRegex.exec(stdout)) !== null) {
        const name = match[1]?.trim();
        const message = match[2]?.trim();
        if (name && message) {
          failures.push({ name, message });
        }
      }

      if (failed === 0 && passed === 0) {
        const errorMatch = stdout.match(/Error:\s*(.+)/);
        if (errorMatch) {
          return this.formatResult(
            false,
            `Test execution error: ${errorMatch[1]}`,
            undefined,
            { command, output: output.join("\n"), passed: 0, failed: 0, failures },
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      output.push(`Error: ${errorMessage}`);

      const execError = error as { stdout?: string; stderr?: string };
      if (execError.stdout) output.push(execError.stdout);
      if (execError.stderr) output.push(execError.stderr);

      return this.formatResult(false, `Test execution failed: ${errorMessage}`, undefined, {
        command,
        output: output.join("\n"),
        passed: 0,
        failed: 1,
        failures: [{ name: "Execution Error", message: errorMessage }],
      });
    }

    return this.formatResult(true, `Tests executed: ${passed} passed, ${failed} failed`, undefined, {
      command,
      pattern,
      passed,
      failed,
      failures,
      output: output.join("\n"),
    });
  }

  private async handleLintCode(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(/(?:lint|format)[:\s]+["']?([^"'\n]+)["']?/i);
    const path = pathMatch?.[1] || this.extractPath(task);

    const fixMatch = task.prompt.match(/--fix|\/fix|fix\s+issues/i);
    const fix = !!fixMatch;

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    return this.formatResult(true, `Linted ${fullPath}`, undefined, {
      path: fullPath,
      fix,
      issues: [],
    });
  }

  private async handleAnalyzeCode(task: AgentTask): Promise<AgentResult> {
    const pathMatch = task.prompt.match(
      /(?:analyze|review)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const path = pathMatch?.[1] || this.extractPath(task);

    const rulesMatch = task.prompt.match(
      /(?:rules?|checks?)[:\s]+["']?([^"'\n]+)["']?/i,
    );
    const rules = rulesMatch?.[1]
      ? rulesMatch[1].split(",").map((r) => r.trim())
      : ["complexity", "style", "bugs", "security"];

    if (!path) {
      return this.formatResult(false, "", "No file path provided");
    }

    const fullPath = this.resolvePath(path, task.context?.cwd);

    if (!existsSync(fullPath)) {
      return this.formatResult(false, "", `File not found: ${fullPath}`);
    }

    const content = readFileSync(fullPath, "utf-8");
    const issues: Array<{
      type: string;
      severity: "error" | "warning" | "info";
      message: string;
      line: number;
      column?: number;
      rule?: string;
    }> = [];

    const language = this.detectLanguage(fullPath);
    const lines = content.split("\n");

    const stats = {
      lines: lines.length,
      functions: 0,
      classes: 0,
      comments: 0,
      complexity: 1,
    };

    let braceCount = 0;
    let inFunction = false;
    let functionDepth = 0;
    let maxDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const column = line.search(/\S/);

      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        stats.comments++;
      }

      if (
        /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(trimmed) ||
        /^\s*(export\s+)?class\s+\w+/.test(trimmed) ||
        /^\s*const\s+\w+\s*=\s*(async\s+)?\(?\s*[^=]*\s*\)?\s*=>/.test(trimmed)
      ) {
        if (!inFunction) {
          inFunction = true;
          functionDepth = 0;
        }
        functionDepth++;
        maxDepth = Math.max(maxDepth, functionDepth);
      }

      if (/^\s*class\s+/.test(trimmed)) {
        stats.classes++;
        issues.push({
          type: "structure",
          severity: "info",
          message: `Class definition found at line ${i + 1}`,
          line: i + 1,
          column: column + 1,
          rule: "structure",
        });
      }

      if (/function\s+\w+|const\s+\w+\s*=\s*function/.test(trimmed)) {
        stats.functions++;
      }

      if (rules.includes("complexity")) {
        if (/if|else|for|while|switch|catch|\?\s*:/.test(trimmed)) {
          stats.complexity++;
        }

        if (stats.complexity > 10) {
          issues.push({
            type: "complexity",
            severity: "warning",
            message: `High cyclomatic complexity (${stats.complexity})`,
            line: i + 1,
            rule: "complexity",
          });
        }
      }

      if (rules.includes("style")) {
        if (/var\s+\w+/.test(trimmed)) {
          issues.push({
            type: "style",
            severity: "warning",
            message: "Use 'let' or 'const' instead of 'var'",
            line: i + 1,
            column: column + 1,
            rule: "no-var",
          });
        }

        if (trimmed.length > 120) {
          issues.push({
            type: "style",
            severity: "info",
            message: `Line exceeds 120 characters (${trimmed.length})`,
            line: i + 1,
            rule: "max-line-length",
          });
        }

        if (/console\.(log|debug)/.test(trimmed)) {
          issues.push({
            type: "style",
            severity: "info",
            message: "Consider removing debug console statements",
            line: i + 1,
            column: column + 1,
            rule: "no-console",
          });
        }
      }

      if (rules.includes("bugs")) {
        if (/==(?!=)/.test(trimmed) && !/===/.test(trimmed)) {
          issues.push({
            type: "bugs",
            severity: "warning",
            message: "Use '===' instead of '=='",
            line: i + 1,
            column: column + 1,
            rule: "eqeqeq",
          });
        }

        if (/eval\s*\(/.test(trimmed)) {
          issues.push({
            type: "security",
            severity: "error",
            message: "Avoid using 'eval()' - security risk",
            line: i + 1,
            column: column + 1,
            rule: "no-eval",
          });
        }
      }

      if (rules.includes("security")) {
        if (/(password|secret|token|api_key|apikey)\s*[:=]/.test(trimmed.toLowerCase())) {
          issues.push({
            type: "security",
            severity: "warning",
            message: "Potential hardcoded secret detected",
            line: i + 1,
            column: column + 1,
            rule: "no-hardcoded-secrets",
          });
        }

        if (/innerHTML\s*=/.test(trimmed)) {
          issues.push({
            type: "security",
            severity: "warning",
            message: "Avoid innerHTML to prevent XSS",
            line: i + 1,
            column: column + 1,
            rule: "no-innerhtml",
          });
        }
      }

      if (/throw\s+new\s+Error/.test(trimmed)) {
        issues.push({
          type: "bugs",
          severity: "info",
          message: "Consider throwing specific error types",
          line: i + 1,
          column: column + 1,
          rule: "throw-error",
        });
      }
    }

    let score = 100;
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    score -= errorCount * 10;
    score -= warningCount * 3;
    score -= infoCount * 1;
    score = Math.max(0, Math.min(100, score));

    const summary = {
      errors: errorCount,
      warnings: warningCount,
      info: infoCount,
      score,
      stats,
    };

    return this.formatResult(true, `Analyzed ${fullPath}`, undefined, {
      path: fullPath,
      language,
      issues,
      score,
      summary,
      rules,
    });
  }

  private resolvePath(path: string, cwd?: string): string {
    return join(cwd || process.cwd(), path);
  }

  private extractPath(task: AgentTask): string {
    const patterns = [
      /["']?([^"'\n]+\.\w+)["']?/,
      /path[:\s]+["']?([^"'\n]+)["']?/i,
      /file[:\s]+["']?([^"'\n]+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = task.prompt.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return "";
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      c: "c",
      h: "c",
      hpp: "cpp",
    };

    return languageMap[ext || ""] || "unknown";
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default CodeAgent;
