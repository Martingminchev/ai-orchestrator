/**
 * @fileoverview Worker Agent implementation for executing coding, writing, and analysis tasks.
 * The Worker Agent is the primary agent type that performs actual work in the orchestration
 * system, equipped with a full toolset for file operations, terminal commands, and progress reporting.
 * @module agents/workerAgent
 */

import { BaseAgent } from './baseAgent.js';
import { WORKER_TOOLS } from './tools/definitions.js';
import { fileManager } from '../services/fileManager.js';
import { terminalService } from '../services/terminal.js';
import { taskCoordinator } from '../services/taskCoordinator.js';

// Content size limits to prevent exceeding API message limits
const MAX_FILE_CONTENT_SIZE = 100 * 1024; // 100KB max for file content in responses
const MAX_STDOUT_SIZE = 50 * 1024; // 50KB max for terminal stdout
const MAX_STDERR_SIZE = 20 * 1024; // 20KB max for terminal stderr

/**
 * @typedef {Object} ContextFile
 * @property {string} path - Absolute or relative path to the file
 * @property {string} [content] - Pre-loaded file content
 * @property {string} [relevance] - Explanation of why this file is relevant to the task
 */

/**
 * @typedef {Object} ContextRequestParams
 * @property {string} description - What additional context is needed and why
 * @property {string[]} [suggestedFiles] - Optional list of file paths that might contain the needed context
 * @property {string} agentId - ID of the agent requesting context
 */

/**
 * @typedef {Object} ContextRequestResult
 * @property {ContextFile[]} [files] - Array of context files provided
 * @property {string} [message] - Message about the context provision
 */

/**
 * @typedef {Object} WorkerAgentOptions
 * @property {string} [id] - Unique agent ID (auto-generated if not provided)
 * @property {string} [expertise='general software development'] - Agent specialization
 * @property {string} [customSystemPrompt] - Custom system prompt (overrides generated prompt if provided)
 * @property {string} [taskId] - Associated task ID for file locking coordination
 * @property {Object} [fileManager] - Scoped FileManager instance for file operations (uses global if not provided)
 * @property {string} [projectPath] - Project folder path for terminal working directory
 * @property {ContextFile[]} [contextFiles=[]] - Pre-loaded context files for the task
 * @property {function(ContextRequestParams): Promise<ContextRequestResult>} [onContextRequest] - Callback when agent needs more context
 * @property {string} [additionalInstructions=''] - Extra instructions to append to the system prompt
 * @property {string} apiKey - API key for the LLM service
 * @property {number} [maxIterations=100] - Maximum tool-calling iterations
 * @property {function} [onProgress] - Callback for progress updates
 * @property {AbortSignal} [abortSignal] - Signal for cancellation support
 */

/**
 * @typedef {Object} TaskExecutionResult
 * @property {string} content - Final text response from the agent
 * @property {Array<{name: string, args: Object, iteration: number}>} toolsUsed - List of tools called
 * @property {number} iterations - Number of LLM call iterations
 * @property {number} duration - Total execution time in milliseconds
 * @property {Object} [finalToolResult] - Result from mark_complete tool if used
 */

/**
 * Generates a system prompt tailored to the worker agent's expertise and instructions.
 * 
 * @param {string} expertise - The agent's area of specialization
 * @param {string} [additionalInstructions=''] - Extra instructions to include in the prompt
 * @returns {string} The complete system prompt for the worker agent
 * @private
 */
function generateWorkerSystemPrompt(expertise, additionalInstructions = '') {
  return `You are a specialized Worker Agent with expertise in: ${expertise}

Your job is to complete the assigned task using the tools available to you.

## Available Tools
- run_terminal: Execute shell commands (tests, builds, linters)
- read_file: Read file contents to understand context
- write_file: Create or modify files
- search_codebase: Search for patterns in the codebase
- list_directory: Explore directory structure
- report_progress: Update status to the orchestrator
- request_context: Ask for additional files if needed
- mark_complete: Signal when your work is done

## Guidelines
1. **Understand First**: Read relevant files before making changes to understand the context
2. **Incremental Changes**: Make changes incrementally and verify they work
3. **Verify Your Work**: Use the terminal to run tests, linters, or build commands as needed
4. **Communicate Progress**: Report progress regularly so the orchestrator knows your status
5. **Request What You Need**: If you need more context or files, use the request_context tool
6. **Complete Properly**: When your task is complete, use the mark_complete tool with a summary

## Context Strategy
- You have a list of relevant files identified for this task
- Use read_file to examine files as needed - don't load everything at once  
- Start with the most relevant files for your current step
- Keep context lean to stay within API limits
- Only read files you actually need for the current step

## Important Rules
- Always verify your changes work before marking complete
- If you encounter errors, try to fix them or report them clearly
- Be precise with file paths - use the exact paths from your context
- Write clean, well-documented code
- Follow existing code style and conventions in the project
- Handle edge cases and add appropriate error handling

${additionalInstructions ? `## Additional Instructions\n${additionalInstructions}` : ''}`;
}

/**
 * Worker Agent that performs actual coding, writing, and analysis tasks.
 * 
 * The Worker Agent extends BaseAgent with a comprehensive toolset for:
 * - File operations (read, write, search, list)
 * - Terminal command execution
 * - Progress reporting to the orchestrator
 * - Context requests when more information is needed
 * - Task completion signaling
 * 
 * Workers integrate with the TaskCoordinator for file locking to prevent
 * conflicts when multiple agents work in parallel.
 * 
 * @extends BaseAgent
 * 
 * @example
 * // Create a worker agent for React development
 * const worker = new WorkerAgent({
 *   expertise: 'React TypeScript developer',
 *   taskId: 'task-123',
 *   apiKey: process.env.KIMI_API_KEY,
 *   contextFiles: [
 *     { path: 'src/App.tsx', content: '...', relevance: 'Main application component' }
 *   ],
 *   onContextRequest: async (params) => {
 *     // Provide additional context when requested
 *     return { files: [...], message: 'Context provided' };
 *   }
 * });
 * 
 * // Execute a task
 * const result = await worker.executeTask('Add a dark mode toggle to the header');
 * 
 * // Clean up when done
 * worker.releaseLocks();
 */
export class WorkerAgent extends BaseAgent {
  /**
   * Creates a new WorkerAgent instance.
   * 
   * @param {WorkerAgentOptions} options - Configuration options for the worker agent
   */
  constructor(options) {
    const {
      expertise = 'general software development',
      customSystemPrompt, // New: custom prompt from Assigner
      taskId,
      fileManager: customFileManager, // New: scoped FileManager from Assigner
      projectPath, // New: project path for terminal working directory
      contextFiles = [],
      onContextRequest,
      additionalInstructions = '',
      ...baseOptions
    } = options;
    
    // Use custom file manager if provided, otherwise fall back to global singleton
    const fm = customFileManager || fileManager;
    
    // Use custom prompt if provided, otherwise generate one
    const systemPrompt = customSystemPrompt || generateWorkerSystemPrompt(expertise, additionalInstructions);
    
    /**
     * Tool executors map for all worker tools.
     * Each executor handles the tool call and returns the result.
     * @type {Object<string, function(Object, WorkerAgent): Promise<Object>>}
     */
    const toolExecutors = {
      /**
       * Execute a shell command in the terminal.
       * Commands run in the project directory by default.
       * @param {Object} args - Tool arguments
       * @param {string} args.command - The shell command to execute
       * @param {string} [args.working_directory] - Working directory for the command (relative to project)
       * @param {number} [args.timeout_ms=30000] - Timeout in milliseconds
       * @returns {Promise<Object>} Execution result
       */
      run_terminal: async (args, agent) => {
        try {
          // Default working directory is the project path
          // If a relative path is provided, resolve it relative to projectPath
          let workingDirectory = projectPath;
          if (args.working_directory) {
            // If projectPath is set, make working_directory relative to it
            if (projectPath) {
              const path = await import('path');
              workingDirectory = path.default.resolve(projectPath, args.working_directory);
              // Security check: ensure we don't escape the project folder
              if (!workingDirectory.startsWith(projectPath)) {
                return {
                  success: false,
                  stdout: '',
                  stderr: `Working directory must be within project folder: ${projectPath}`,
                  exitCode: -1,
                  error: 'Security: attempted to access directory outside project'
                };
              }
            } else {
              workingDirectory = args.working_directory;
            }
          }
          
          const result = await terminalService.execute(args.command, {
            workingDirectory,
            timeout: args.timeout_ms
          });
          
          // Truncate stdout if it exceeds safe size
          let stdout = result.stdout || '';
          let stdoutTruncated = false;
          if (stdout.length > MAX_STDOUT_SIZE) {
            const originalSize = stdout.length;
            stdout = stdout.substring(0, MAX_STDOUT_SIZE) +
              `\n\n... [TRUNCATED: stdout was ${originalSize} bytes, showing first ${MAX_STDOUT_SIZE} bytes]`;
            stdoutTruncated = true;
          }
          
          // Truncate stderr if it exceeds safe size
          let stderr = result.stderr || '';
          let stderrTruncated = false;
          if (stderr.length > MAX_STDERR_SIZE) {
            const originalSize = stderr.length;
            stderr = stderr.substring(0, MAX_STDERR_SIZE) +
              `\n\n... [TRUNCATED: stderr was ${originalSize} bytes, showing first ${MAX_STDERR_SIZE} bytes]`;
            stderrTruncated = true;
          }
          
          return {
            success: result.success,
            stdout,
            stderr,
            exitCode: result.exitCode,
            blocked: result.blocked,
            warning: result.warning,
            truncated: stdoutTruncated || stderrTruncated
          };
        } catch (error) {
          return {
            success: false,
            stdout: '',
            stderr: error.message,
            exitCode: -1,
            error: error.message
          };
        }
      },
      
      /**
       * Read the contents of a file with read lock coordination.
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Path to the file to read
       * @param {string} [args.encoding='utf-8'] - File encoding
       * @returns {Promise<Object>} File contents or error
       */
      read_file: async (args, agent) => {
        // Acquire read lock if task coordination is enabled
        if (taskId) {
          try {
            await taskCoordinator.acquireLock(agent.id, args.path, 'read', { taskId });
          } catch (lockError) {
            return {
              success: false,
              error: `Could not acquire read lock: ${lockError.message}`
            };
          }
        }
        
        try {
          const result = await fm.readFile(args.path, {
            encoding: args.encoding
          });
          
          // Truncate content if it exceeds safe size for API
          if (result.success && result.content && result.content.length > MAX_FILE_CONTENT_SIZE) {
            const originalSize = result.content.length;
            result.content = result.content.substring(0, MAX_FILE_CONTENT_SIZE) +
              `\n\n... [TRUNCATED: File content is ${originalSize} bytes, showing first ${MAX_FILE_CONTENT_SIZE} bytes. Use search_codebase to find specific content or read specific sections.]`;
            result.truncated = true;
            result.originalSize = originalSize;
          }
          
          return result;
        } catch (error) {
          return {
            success: false,
            error: error.message,
            metadata: { path: args.path, size: 0, modified: new Date(0), created: new Date(0) }
          };
        } finally {
          // Release read lock
          if (taskId) {
            taskCoordinator.releaseLock(agent.id, args.path);
          }
        }
      },
      
      /**
       * Write or create a file with write lock coordination.
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Path where the file should be written
       * @param {string} args.content - Content to write to the file
       * @param {boolean} [args.create_directories=true] - Create parent directories if needed
       * @returns {Promise<Object>} Write result
       */
      write_file: async (args, agent) => {
        // Acquire write lock if task coordination is enabled
        if (taskId) {
          const lockResult = await taskCoordinator.acquireLock(agent.id, args.path, 'write', { taskId });
          if (!lockResult.success) {
            return {
              success: false,
              error: `Could not acquire write lock: ${lockResult.error}`,
              conflictingAgent: lockResult.conflictingAgent,
              path: args.path,
              bytesWritten: 0,
              created: false
            };
          }
        }
        
        try {
          const result = await fm.writeFile(args.path, args.content, {
            createDirectories: args.create_directories !== false
          });
          return result;
        } catch (error) {
          return {
            success: false,
            error: error.message,
            path: args.path,
            bytesWritten: 0,
            created: false
          };
        } finally {
          // Release write lock
          if (taskId) {
            taskCoordinator.releaseLock(agent.id, args.path);
          }
        }
      },
      
      /**
       * Search for patterns in the codebase using regex.
       * @param {Object} args - Tool arguments
       * @param {string} args.pattern - Regex pattern to search for
       * @param {string} [args.path] - Base path to search in
       * @param {string} [args.file_pattern] - Glob pattern to filter files
       * @returns {Promise<Object>} Search results
       */
      search_codebase: async (args) => {
        try {
          const result = await fm.searchFiles(args.pattern, {
            basePath: args.path,
            filePattern: args.file_pattern,
            maxResults: 50
          });
          return result;
        } catch (error) {
          return {
            success: false,
            error: error.message,
            pattern: args.pattern,
            results: [],
            totalMatches: 0,
            truncated: false
          };
        }
      },
      
      /**
       * List the contents of a directory.
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Path to the directory
       * @param {boolean} [args.recursive=false] - Whether to list recursively
       * @param {number} [args.max_depth] - Maximum depth for recursive listing
       * @returns {Promise<Object>} Directory listing
       */
      list_directory: async (args) => {
        try {
          const result = await fm.listDirectory(args.path, {
            recursive: args.recursive,
            maxDepth: args.max_depth
          });
          return result;
        } catch (error) {
          return {
            success: false,
            error: error.message,
            path: args.path,
            entries: []
          };
        }
      },
      
      /**
       * Report progress to the orchestrator.
       * @param {Object} args - Tool arguments
       * @param {string} args.status - Current status ('working', 'blocked', 'needs_input', 'completed')
       * @param {string} args.message - Description of current progress
       * @param {number} [args.percentage] - Optional completion percentage (0-100)
       * @returns {Promise<Object>} Acknowledgment
       */
      report_progress: async (args, agent) => {
        agent.emitProgress('worker_progress', {
          status: args.status,
          message: args.message,
          percentage: args.percentage
        });
        return { acknowledged: true };
      },
      
      /**
       * Request additional context files from the orchestrator.
       * @param {Object} args - Tool arguments
       * @param {string} args.description - What additional context is needed and why
       * @param {string[]} [args.suggested_files] - Optional list of suggested file paths
       * @returns {Promise<Object>} Context provision result
       */
      request_context: async (args, agent) => {
        if (onContextRequest) {
          try {
            const newContext = await onContextRequest({
              description: args.description,
              suggestedFiles: args.suggested_files,
              agentId: agent.id
            });
            return {
              provided: true,
              files: newContext.files || [],
              message: newContext.message || 'Context provided'
            };
          } catch (error) {
            return {
              provided: false,
              message: `Failed to get context: ${error.message}`
            };
          }
        }
        return {
          provided: false,
          message: 'No context provider available'
        };
      },
      
      /**
       * Mark the task as complete with a summary.
       * This is a terminal tool that ends the agent execution loop.
       * @param {Object} args - Tool arguments
       * @param {string} args.summary - Summary of the work completed
       * @param {string[]} [args.files_modified=[]] - List of files that were modified
       * @param {string[]} [args.files_created=[]] - List of new files that were created
       * @returns {Promise<Object>} Completion result
       */
      mark_complete: async (args) => {
        return {
          summary: args.summary,
          filesModified: args.files_modified || [],
          filesCreated: args.files_created || [],
          completed: true
        };
      }
    };
    
    super({
      ...baseOptions,
      role: 'worker',
      systemPrompt,
      tools: WORKER_TOOLS,
      toolExecutors
    });
    
    /**
     * The agent's area of expertise/specialization.
     * @type {string}
     */
    this.expertise = expertise;
    
    /**
     * Associated task ID for file locking coordination.
     * @type {string|undefined}
     */
    this.taskId = taskId;
    
    /**
     * Project folder path where all file operations and terminal commands are scoped.
     * @type {string|undefined}
     */
    this.projectPath = projectPath;
    
    /**
     * FileManager instance for file operations (may be scoped to project folder).
     * @type {FileManager}
     */
    this.fileManager = fm;
    
    /**
     * Pre-loaded context files for the task.
     * @type {ContextFile[]}
     */
    this.contextFiles = contextFiles;
    
    /**
     * Callback for requesting additional context.
     * @type {function(ContextRequestParams): Promise<ContextRequestResult>|undefined}
     */
    this.onContextRequest = onContextRequest;
  }
  
  /**
   * Execute a task with pre-loaded context files.
   * 
   * Builds an initial message containing the task description and all context files,
   * then runs the agent's tool-calling loop until completion.
   * 
   * @param {string} taskDescription - Detailed description of what needs to be done
   * @returns {Promise<TaskExecutionResult>} Execution result including summary and files changed
   * 
   * @example
   * const result = await worker.executeTask(`
   *   Add input validation to the user registration form.
   *   - Validate email format
   *   - Require password minimum 8 characters
   *   - Show inline error messages
   * `);
   * 
   * console.log(result.finalToolResult?.summary);
   * console.log(result.finalToolResult?.filesModified);
   */
  async executeTask(taskDescription) {
    // Build the initial message with context
    let message = `## Task\n${taskDescription}\n\n`;
    
    if (this.contextFiles.length > 0) {
      message += `## Available Context Files\n`;
      message += `The following files have been identified as relevant to your task.\n`;
      message += `Use the \`read_file\` tool to examine these files when needed:\n\n`;
      
      for (const file of this.contextFiles) {
        message += `- **${file.path}**`;
        if (file.relevance) message += ` - ${file.relevance}`;
        if (file.size) message += ` (${Math.round(file.size / 1024)}KB)`;
        message += `\n`;
      }
      
      message += `\n> **Note:** File contents are not pre-loaded to keep this message lean. `;
      message += `Read files on-demand as you work through the task. `;
      message += `This approach is more efficient and ensures you always see the latest file state.\n`;
    }
    
    message += `\nPlease complete the task. Use \`report_progress\` to update on your status, and \`mark_complete\` when done with a summary of your changes.`;
    
    try {
      return await this.run(message);
    } finally {
      // Always release locks when task execution ends
      this.releaseLocks();
    }
  }
  
  /**
   * Release all file locks held by this agent.
   * 
   * Should be called when the agent completes its work, encounters an error,
   * or is cancelled. This is automatically called at the end of `executeTask`.
   * 
   * @returns {{released: string[], queuedAgentsNotified: number}} Release summary
   * 
   * @example
   * // Manual cleanup after error
   * try {
   *   await worker.executeTask('...');
   * } catch (error) {
   *   worker.releaseLocks();
   *   throw error;
   * }
   */
  releaseLocks() {
    if (this.taskId) {
      return taskCoordinator.releaseAllLocks(this.id);
    }
    return { released: [], queuedAgentsNotified: 0 };
  }
  
  /**
   * Get the current state of the worker agent including expertise and task info.
   * Extends the base agent state with worker-specific properties.
   * 
   * @returns {Object} Complete agent state for serialization
   * @returns {string} state.id - Agent ID
   * @returns {string} state.role - Agent role ('worker')
   * @returns {string} state.status - Current status
   * @returns {string} state.expertise - Agent expertise area
   * @returns {string} [state.taskId] - Associated task ID
   * @returns {number} state.contextFilesCount - Number of context files loaded
   * @returns {number} state.iterations - Number of iterations completed
   * @returns {number|null} state.duration - Total duration in milliseconds
   * @returns {Object|null} state.result - Execution result if completed
   * @returns {string} [state.error] - Error message if failed
   */
  getState() {
    const baseState = super.getState();
    return {
      ...baseState,
      expertise: this.expertise,
      taskId: this.taskId,
      contextFilesCount: this.contextFiles.length
    };
  }
}

/**
 * Factory function to create a configured worker agent.
 * 
 * Provides a convenient way to create worker agents with common configurations
 * and sensible defaults.
 * 
 * @param {WorkerAgentOptions} options - Worker agent options
 * @returns {WorkerAgent} A new WorkerAgent instance
 * 
 * @example
 * const worker = createWorkerAgent({
 *   expertise: 'Node.js backend developer',
 *   taskId: 'task-456',
 *   apiKey: process.env.KIMI_API_KEY,
 *   contextFiles: await contextAgent.findRelevantFiles(task),
 *   onProgress: (event) => console.log(`[${event.type}]`, event.message)
 * });
 * 
 * const result = await worker.executeTask('Implement rate limiting middleware');
 */
export function createWorkerAgent(options) {
  return new WorkerAgent(options);
}

export default WorkerAgent;
