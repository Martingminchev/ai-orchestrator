// System Tools - Tool implementations for system operations
// Used by the system agent for shell commands and process management

import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import type { ToolExecutor, ToolInput, ToolOutput, ToolDefinition } from "../../tools/types.js";

const execAsync = promisify(exec);

// Commands that are considered safe to run
const SAFE_COMMANDS = new Set([
  "ls", "dir", "pwd", "cd", "echo", "cat", "head", "tail", "grep", "find",
  "node", "npm", "npx", "pnpm", "yarn", "bun",
  "git", "gh",
  "python", "python3", "pip", "pip3",
  "which", "where", "type",
  "date", "time", "whoami", "hostname",
  "curl", "wget",
]);

// Commands that are blocked for safety
const BLOCKED_COMMANDS = new Set([
  "rm", "del", "rmdir", "format", "mkfs",
  "shutdown", "reboot", "halt", "poweroff",
  "kill", "killall", "pkill",
  "sudo", "su", "runas",
  "chmod", "chown",
  ">", ">>", // Redirects that could overwrite files
]);

class RunCommandTool implements ToolExecutor {
  private cwd: string;
  private timeout: number;

  constructor(cwd?: string, timeout: number = 30000) {
    this.cwd = cwd || process.cwd();
    this.timeout = timeout;
  }

  getDefinition(): ToolDefinition {
    return {
      name: "run_command",
      description: "Run a shell command and get the output. Some dangerous commands are blocked for safety.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to run" },
          cwd: { type: "string", description: "Working directory (optional)" },
          timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
        },
        required: ["command"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.command || typeof input.command !== "string") {
      errors.push("command is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const command = input.command as string;
      const cwd = (input.cwd as string) || this.cwd;
      const timeout = (input.timeout as number) || this.timeout;

      // Check for blocked commands
      const firstWord = command.split(/\s+/)[0].toLowerCase();
      if (BLOCKED_COMMANDS.has(firstWord)) {
        return {
          success: false,
          error: `Command '${firstWord}' is blocked for safety. Blocked commands: ${Array.from(BLOCKED_COMMANDS).join(", ")}`,
        };
      }

      // Check for redirect operators
      if (command.includes(">") || command.includes(">>")) {
        return {
          success: false,
          error: "Redirect operators (> and >>) are not allowed for safety. Use write_file tool instead.",
        };
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return {
        success: true,
        result: {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command,
          cwd,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        result: {
          stdout: error.stdout?.trim() || "",
          stderr: error.stderr?.trim() || "",
          exitCode: error.code,
        },
      };
    }
  }
}

class GetEnvTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "get_env",
      description: "Get environment variable values",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Environment variable name (optional, returns all if not specified)" },
        },
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const name = input.name as string | undefined;

      if (name) {
        const value = process.env[name];
        return {
          success: true,
          result: { name, value: value || null, exists: value !== undefined },
        };
      }

      // Return safe environment variables (filter out sensitive ones)
      const safeKeys = Object.keys(process.env).filter((key) => {
        const lowerKey = key.toLowerCase();
        return !lowerKey.includes("key") &&
               !lowerKey.includes("secret") &&
               !lowerKey.includes("password") &&
               !lowerKey.includes("token") &&
               !lowerKey.includes("credential");
      });

      const safeEnv: Record<string, string> = {};
      for (const key of safeKeys) {
        safeEnv[key] = process.env[key] || "";
      }

      return {
        success: true,
        result: { variables: safeEnv, count: safeKeys.length },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

class GetSystemInfoTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "get_system_info",
      description: "Get system information (OS, platform, architecture, etc.)",
      inputSchema: {
        type: "object",
        properties: {},
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const os = await import("os");
      
      return {
        success: true,
        result: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          hostname: os.hostname(),
          cpus: os.cpus().length,
          totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + " GB",
          freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + " GB",
          uptime: Math.round(os.uptime() / 3600) + " hours",
          homeDir: os.homedir(),
          tmpDir: os.tmpdir(),
          cwd: process.cwd(),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

class CheckProcessTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "check_process",
      description: "Check if a process is running by name or port",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Process name to search for" },
          port: { type: "number", description: "Port number to check (alternative to name)" },
        },
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.name && !input.port) {
      errors.push("Either name or port must be provided");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const name = input.name as string | undefined;
      const port = input.port as number | undefined;

      let command: string;
      if (process.platform === "win32") {
        if (port) {
          command = `netstat -ano | findstr :${port}`;
        } else {
          command = `tasklist | findstr /i "${name}"`;
        }
      } else {
        if (port) {
          command = `lsof -i :${port} || netstat -tulpn 2>/dev/null | grep :${port}`;
        } else {
          command = `pgrep -la "${name}" || ps aux | grep -i "${name}" | grep -v grep`;
        }
      }

      const { stdout } = await execAsync(command, { timeout: 5000 });
      const running = stdout.trim().length > 0;

      return {
        success: true,
        result: {
          query: name || `port:${port}`,
          running,
          details: stdout.trim() || null,
        },
      };
    } catch (error: any) {
      // Command failed means process not found
      if (error.code === 1) {
        return {
          success: true,
          result: {
            query: input.name || `port:${input.port}`,
            running: false,
            details: null,
          },
        };
      }
      return { success: false, error: error.message || String(error) };
    }
  }
}

class WhichTool implements ToolExecutor {
  getDefinition(): ToolDefinition {
    return {
      name: "which",
      description: "Find the path to an executable",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to locate" },
        },
        required: ["command"],
      },
    };
  }

  validate(input: ToolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.command || typeof input.command !== "string") {
      errors.push("command is required and must be a string");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    try {
      const command = input.command as string;
      const whichCmd = process.platform === "win32" ? "where" : "which";

      const { stdout } = await execAsync(`${whichCmd} ${command}`, { timeout: 5000 });
      const path = stdout.trim().split("\n")[0];

      return {
        success: true,
        result: {
          command,
          path: path || null,
          found: !!path,
        },
      };
    } catch (error: any) {
      return {
        success: true,
        result: {
          command: input.command,
          path: null,
          found: false,
        },
      };
    }
  }
}

/**
 * Create all system tools
 */
export function createSystemTools(cwd?: string): ToolExecutor[] {
  return [
    new RunCommandTool(cwd),
    new GetEnvTool(),
    new GetSystemInfoTool(),
    new CheckProcessTool(),
    new WhichTool(),
  ];
}
