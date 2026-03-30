import type { ToolInput, ToolOutput, ToolExecutor, SandboxedTool } from "./types.js";

interface SandboxConfig {
  enabled: boolean;
  allowedPaths?: string[];
  deniedPaths?: string[];
  maxMemory?: number;
  maxFileSize?: number;
  timeout?: number;
  networkAccess?: boolean;
}

interface SandboxContext {
  cwd: string;
  allowedPaths: Set<string>;
  deniedPaths: Set<string>;
  maxMemory: number;
  maxFileSize: number;
  timeout: number;
  networkAccess: boolean;
  executionDepth: number;
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  maxMemory: 100 * 1024 * 1024,
  maxFileSize: 10 * 1024 * 1024,
  timeout: 30000,
  networkAccess: false,
};

export class ToolSandbox {
  private config: SandboxConfig;
  private executionStack: number = 0;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  createContext(cwd: string): SandboxContext {
    return {
      cwd,
      allowedPaths: new Set(this.config.allowedPaths || []),
      deniedPaths: new Set(this.config.deniedPaths || []),
      maxMemory: this.config.maxMemory ?? DEFAULT_CONFIG.maxMemory!,
      maxFileSize: this.config.maxFileSize ?? DEFAULT_CONFIG.maxFileSize!,
      timeout: this.config.timeout ?? DEFAULT_CONFIG.timeout!,
      networkAccess: this.config.networkAccess ?? DEFAULT_CONFIG.networkAccess!,
      executionDepth: 0,
    };
  }

  isPathAllowed(path: string, context: SandboxContext): boolean {
    if (!this.config.enabled) {
      return true;
    }

    if (context.deniedPaths.has(path)) {
      return false;
    }

    if (context.allowedPaths.size > 0) {
      return context.allowedPaths.has(path);
    }

    return true;
  }

  isWithinMemoryLimit(used: number, context: SandboxContext): boolean {
    return used <= context.maxMemory;
  }

  isWithinFileSizeLimit(size: number, context: SandboxContext): boolean {
    return size <= context.maxFileSize;
  }

  canAccessNetwork(): boolean {
    return this.config.networkAccess;
  }

  wrapTool(tool: ToolExecutor, context: SandboxContext): SandboxedTool {
    const sandbox = this;

    return {
      execute: async (input: ToolInput): Promise<ToolOutput> => {
        if (!this.config.enabled) {
          return tool.execute(input);
        }

        context.executionDepth++;

        if (context.executionDepth > 10) {
          return {
            success: false,
            error: "Maximum execution depth exceeded",
          };
        }

        const validation = tool.validate(input);
        if (!validation.valid) {
          return {
            success: false,
            error: `Validation failed: ${validation.errors.join(", ")}`,
          };
        }

        const startTime = Date.now();

        try {
          const output = await Promise.race([
            tool.execute(input),
            new Promise<ToolOutput>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), context.timeout),
            ),
          ]);

          return output;
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Execution failed",
          };
        } finally {
          context.executionDepth--;
        }
      },

      validate: (input: ToolInput) => tool.validate(input),

      getDefinition: () => tool.getDefinition(),

      setSandbox: (enabled: boolean) => {
        this.config.enabled = enabled;
      },

      isSandboxed: () => this.config.enabled,
    };
  }

  applySecurityPolicies(
    path: string,
    operation: "read" | "write" | "delete" | "execute",
    context: SandboxContext,
  ): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    if (!this.isPathAllowed(path, context)) {
      return { allowed: false, reason: "Path not allowed" };
    }

    if (operation === "write" || operation === "delete") {
      if (path.includes(".git") || path.includes("node_modules")) {
        return { allowed: false, reason: "Protected directory" };
      }
    }

    return { allowed: true };
  }

  createSecureEnvironment(context: SandboxContext): Record<string, unknown> {
    return {
      cwd: context.cwd,
      maxMemory: context.maxMemory,
      maxFileSize: context.maxFileSize,
      networkAccess: context.networkAccess,
    };
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createSandbox(config?: Partial<SandboxConfig>): ToolSandbox {
  return new ToolSandbox(config);
}

export default ToolSandbox;
