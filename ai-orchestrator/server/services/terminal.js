/**
 * @fileoverview Sandboxed terminal execution service for AI agents.
 * Provides secure command execution with path validation, command whitelisting,
 * and dangerous command detection.
 * @module server/services/terminal
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

/**
 * Whitelist of commands considered safe for execution without confirmation.
 * @type {Set<string>}
 */
const SAFE_COMMANDS = new Set([
  'npm', 'node', 'git', 'python', 'pip', 'pnpm', 'yarn',
  'tsc', 'eslint', 'prettier', 'jest', 'vitest',
  'cat', 'ls', 'dir', 'cd', 'pwd', 'mkdir', 'touch', 'echo', 'type', 'more'
]);

/**
 * Patterns for detecting dangerous commands that could cause data loss or system damage.
 * @type {Array<{pattern: RegExp, description: string}>}
 */
const DANGEROUS_PATTERNS = [
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|.*-[a-zA-Z]*f[a-zA-Z]*)/i, description: 'Recursive/forced file deletion (rm -rf or rm -f)' },
  { pattern: /\bdel\s+\/s/i, description: 'Recursive file deletion (del /s)' },
  { pattern: /\bformat\s+[a-zA-Z]:/i, description: 'Disk formatting command' },
  { pattern: /\brmdir\s+\/s/i, description: 'Recursive directory removal (rmdir /s)' },
  { pattern: /\bRemove-Item\s+.*-Recurse/i, description: 'PowerShell recursive removal' },
  { pattern: /\brd\s+\/s/i, description: 'Recursive directory removal (rd /s)' },
  { pattern: />\s*\/dev\/null\s*2>&1\s*&/i, description: 'Background process with suppressed output' },
  { pattern: /\|.*\bxargs\b.*\brm\b/i, description: 'Piped deletion command' },
  { pattern: /\bchmod\s+777/i, description: 'Overly permissive file permissions' },
  { pattern: /\bchown\s+-R\s+root/i, description: 'Recursive ownership change to root' },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, description: 'System shutdown/reboot command' },
  { pattern: /\bmkfs\b/i, description: 'Filesystem creation (potentially destructive)' },
  { pattern: /\bdd\s+if=/i, description: 'Low-level disk copy (dd command)' },
  { pattern: />\s*(\/etc\/|C:\\Windows\\)/i, description: 'Writing to system directories' },
  { pattern: /\bkill\s+-9\s+(-1|0)\b/i, description: 'Killing all processes' },
  { pattern: /\bsudo\s+rm\b/i, description: 'Sudo removal command' },
  { pattern: /\benv\s*\|\s*xargs/i, description: 'Environment variable manipulation' },
  { pattern: /`:(){.*};:/i, description: 'Fork bomb pattern' },
];

/**
 * Patterns for detecting directory traversal attempts.
 * @type {Array<RegExp>}
 */
const TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,           // ../
  /[\/\\]\.\./,           // /..
  /%2e%2e[\/\\]/i,        // URL encoded ../
  /%252e%252e/i,          // Double URL encoded
];

/**
 * Terminal execution service for AI agents with security controls.
 */
export class TerminalService {
  /**
   * Creates a new TerminalService instance.
   * @param {Object} options - Configuration options
   * @param {string} [options.allowedBasePath='C:\\Users\\marti\\Desktop\\Projects'] - Base path for allowed execution
   * @param {boolean} [options.yoloMode=false] - Initial yolo mode state
   * @param {number} [options.defaultTimeout=30000] - Default command timeout in milliseconds
   */
  constructor(options = {}) {
    /** @type {string} */
    this.allowedBasePath = path.resolve(options.allowedBasePath || 'C:\\Users\\marti\\Desktop\\Projects');
    
    /** @type {boolean} */
    this._yoloMode = options.yoloMode || false;
    
    /** @type {number} */
    this.defaultTimeout = options.defaultTimeout || 30000;
    
    /** @type {Array<Object>} */
    this.auditLog = [];
    
    /** @type {boolean} */
    this.isWindows = os.platform() === 'win32';
  }

  /**
   * Enables or disables yolo mode.
   * When enabled, all safety checks are bypassed.
   * @param {boolean} enabled - Whether to enable yolo mode
   */
  setYoloMode(enabled) {
    this._yoloMode = Boolean(enabled);
    this._log('info', `Yolo mode ${this._yoloMode ? 'enabled' : 'disabled'}`);
  }

  /**
   * Returns the current yolo mode state.
   * @returns {boolean} Current yolo mode state
   */
  isYoloMode() {
    return this._yoloMode;
  }

  /**
   * Validates if a given path is within the allowed base path.
   * @param {string} targetPath - Path to validate
   * @returns {boolean} True if path is allowed
   */
  isPathAllowed(targetPath) {
    if (!targetPath) return false;
    
    try {
      // Check for traversal patterns in the raw input
      for (const pattern of TRAVERSAL_PATTERNS) {
        if (pattern.test(targetPath)) {
          return false;
        }
      }
      
      // Resolve to absolute path and normalize
      const resolved = path.resolve(targetPath);
      const normalized = path.normalize(resolved);
      
      // Ensure the normalized path starts with the allowed base path
      // Use lowercase comparison on Windows for case-insensitivity
      const normalizedLower = this.isWindows ? normalized.toLowerCase() : normalized;
      const baseLower = this.isWindows ? this.allowedBasePath.toLowerCase() : this.allowedBasePath;
      
      return normalizedLower.startsWith(baseLower);
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if a command is in the safe commands whitelist.
   * @param {string} command - Command to check
   * @returns {{safe: boolean, reason?: string}} Safety check result
   */
  isSafeCommand(command) {
    if (!command || typeof command !== 'string') {
      return { safe: false, reason: 'Invalid command' };
    }

    // Extract the base command (first word)
    const trimmed = command.trim();
    const baseCommand = this._extractBaseCommand(trimmed);
    
    if (!baseCommand) {
      return { safe: false, reason: 'Could not parse command' };
    }

    // Check if base command is in whitelist
    const commandName = path.basename(baseCommand).replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
    
    if (SAFE_COMMANDS.has(commandName)) {
      return { safe: true };
    }

    return { 
      safe: false, 
      reason: `Command '${commandName}' is not in the safe commands whitelist. Safe commands: ${Array.from(SAFE_COMMANDS).join(', ')}` 
    };
  }

  /**
   * Checks if a command matches any dangerous patterns.
   * @param {string} command - Command to check
   * @returns {{dangerous: boolean, reason?: string}} Danger check result
   */
  isDangerousCommand(command) {
    if (!command || typeof command !== 'string') {
      return { dangerous: false };
    }

    for (const { pattern, description } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { 
          dangerous: true, 
          reason: description 
        };
      }
    }

    return { dangerous: false };
  }

  /**
   * Executes a command in the terminal with security checks.
   * @param {string} command - Command to execute
   * @param {Object} [options] - Execution options
   * @param {string} [options.workingDirectory] - Working directory (must be within allowedBasePath)
   * @param {number} [options.timeout] - Command timeout in milliseconds
   * @param {Object.<string, string>} [options.env] - Additional environment variables
   * @returns {Promise<{
   *   success: boolean,
   *   stdout: string,
   *   stderr: string,
   *   exitCode: number,
   *   command: string,
   *   workingDirectory: string,
   *   duration: number,
   *   warning?: string,
   *   blocked?: boolean
   * }>} Execution result
   */
  async execute(command, options = {}) {
    const startTime = Date.now();
    const workingDirectory = options.workingDirectory || this.allowedBasePath;
    const timeout = options.timeout || this.defaultTimeout;

    // Base result object
    const result = {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      command,
      workingDirectory,
      duration: 0,
    };

    try {
      // Validate working directory
      if (!this.isPathAllowed(workingDirectory)) {
        result.stderr = `Working directory '${workingDirectory}' is outside the allowed path '${this.allowedBasePath}'`;
        result.blocked = true;
        result.duration = Date.now() - startTime;
        this._log('blocked', `Path validation failed: ${workingDirectory}`, { command });
        return result;
      }

      // Check for dangerous commands
      const dangerCheck = this.isDangerousCommand(command);
      if (dangerCheck.dangerous) {
        if (!this._yoloMode) {
          result.warning = `DANGEROUS COMMAND DETECTED: ${dangerCheck.reason}. Enable yolo mode to execute.`;
          result.blocked = true;
          result.duration = Date.now() - startTime;
          this._log('blocked', `Dangerous command blocked: ${dangerCheck.reason}`, { command });
          return result;
        }
        // In yolo mode, log but continue
        this._logYoloExecution(command, workingDirectory, `Dangerous: ${dangerCheck.reason}`);
      }

      // Check if command is safe (whitelist)
      const safeCheck = this.isSafeCommand(command);
      if (!safeCheck.safe && !this._yoloMode) {
        result.warning = safeCheck.reason;
        result.blocked = true;
        result.duration = Date.now() - startTime;
        this._log('blocked', `Unsafe command blocked: ${safeCheck.reason}`, { command });
        return result;
      }

      // If in yolo mode and command is not safe, log it
      if (!safeCheck.safe && this._yoloMode) {
        this._logYoloExecution(command, workingDirectory, safeCheck.reason);
      }

      // Execute the command
      const execResult = await this._executeCommand(command, {
        cwd: workingDirectory,
        timeout,
        env: { ...process.env, ...options.env },
      });

      result.success = execResult.exitCode === 0;
      result.stdout = execResult.stdout;
      result.stderr = execResult.stderr;
      result.exitCode = execResult.exitCode;
      result.duration = Date.now() - startTime;

      this._log('executed', `Command completed with exit code ${execResult.exitCode}`, { 
        command, 
        workingDirectory,
        duration: result.duration,
      });

      return result;

    } catch (error) {
      result.stderr = error.message;
      result.duration = Date.now() - startTime;
      this._log('error', `Command execution failed: ${error.message}`, { command });
      return result;
    }
  }

  /**
   * Extracts the base command from a command string.
   * @private
   * @param {string} command - Full command string
   * @returns {string|null} Base command or null if parsing fails
   */
  _extractBaseCommand(command) {
    // Handle quoted commands
    if (command.startsWith('"') || command.startsWith("'")) {
      const quote = command[0];
      const endQuote = command.indexOf(quote, 1);
      if (endQuote > 0) {
        return command.substring(1, endQuote);
      }
    }
    
    // Split by space and get first part
    const parts = command.split(/\s+/);
    return parts[0] || null;
  }

  /**
   * Executes a command using child_process.spawn.
   * @private
   * @param {string} command - Command to execute
   * @param {Object} options - Spawn options
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
   */
  _executeCommand(command, options) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Determine shell based on platform
      const shell = this.isWindows ? true : '/bin/bash';
      
      const child = spawn(command, [], {
        ...options,
        shell,
        windowsHide: true,
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!killed) {
          resolve({
            stdout,
            stderr,
            exitCode: code ?? -1,
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!killed) {
          reject(error);
        }
      });
    });
  }

  /**
   * Logs a yolo mode execution for audit purposes.
   * @private
   * @param {string} command - Executed command
   * @param {string} workingDirectory - Working directory
   * @param {string} reason - Reason for yolo execution
   */
  _logYoloExecution(command, workingDirectory, reason) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'yolo_execution',
      command,
      workingDirectory,
      reason,
    };
    this.auditLog.push(entry);
    this._log('yolo', `Yolo mode execution: ${reason}`, { command, workingDirectory });
  }

  /**
   * Internal logging helper.
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [context] - Additional context
   */
  _log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    
    // In production, this could be replaced with a proper logger
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[TerminalService] [${level.toUpperCase()}] ${message}`, context);
    }
    
    // Keep audit log for all operations
    this.auditLog.push(logEntry);
    
    // Limit audit log size
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }

  /**
   * Gets the audit log entries.
   * @param {number} [limit=100] - Maximum number of entries to return
   * @returns {Array<Object>} Recent audit log entries
   */
  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  /**
   * Clears the audit log.
   */
  clearAuditLog() {
    this.auditLog = [];
  }
}

/**
 * Singleton instance of the TerminalService.
 * @type {TerminalService}
 */
export const terminalService = new TerminalService();

export default TerminalService;
