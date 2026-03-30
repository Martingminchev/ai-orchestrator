/**
 * Context Agent - Discovers and gathers relevant files/context for other agents
 * 
 * This agent specializes in analyzing task descriptions, searching codebases,
 * and selecting the most relevant files needed to complete a task.
 * 
 * @module agents/contextAgent
 */

import { BaseAgent } from './baseAgent.js';
import { CONTEXT_AGENT_TOOLS } from './tools/definitions.js';
import { fileManager as globalFileManager } from '../services/fileManager.js';

// Content size limit to prevent exceeding API message limits
const MAX_FILE_CONTENT_SIZE = 100 * 1024; // 100KB max for file content in responses

/**
 * System prompt that defines the Context Agent's behavior and guidelines
 * @constant {string}
 */
const CONTEXT_AGENT_SYSTEM_PROMPT = `You are a Context Agent specialized in discovering and gathering relevant files for other agents.

Your job is to:
1. Analyze the task description to understand what context is needed
2. Search the codebase for relevant files
3. Read key files to understand their purpose
4. Select the most relevant files and explain why they're relevant

Guidelines:
- Start by listing the project structure to understand the layout
- Search for files related to the task keywords
- Read key configuration files (package.json, tsconfig.json, etc.) to understand the tech stack
- Focus on files that would be directly needed to complete the task
- Don't select too many files - only the most relevant ones (typically 5-15 files)
- For each selected file, explain WHY it's relevant

When you've gathered enough context, use the select_files tool to finalize your selection.`;

/**
 * Context Agent class for discovering and gathering relevant files
 * 
 * This agent extends BaseAgent and provides specialized tools for:
 * - Searching the codebase using regex patterns
 * - Reading file contents
 * - Listing directory structures
 * - Selecting files as relevant with explanations
 * 
 * @extends BaseAgent
 * 
 * @example
 * const agent = new ContextAgent({ apiKey: 'your-api-key' });
 * const context = await agent.gatherContext(
 *   'Add a new API endpoint for user authentication',
 *   { projectPath: '/path/to/project' }
 * );
 * console.log(context.files); // Array of relevant files
 * console.log(context.summary); // Summary of why these files are relevant
 */
export class ContextAgent extends BaseAgent {
  /**
   * Creates a new Context Agent instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - API key for the LLM provider
   * @param {Object} [options.fileManager] - Scoped FileManager instance (uses global if not provided)
   * @param {string} [options.model] - Model to use (defaults to BaseAgent default)
   * @param {number} [options.maxIterations] - Maximum agentic loop iterations
   * @param {number} [options.timeout] - Timeout in milliseconds
   * @param {Function} [options.onToolCall] - Callback for tool calls
   * @param {Function} [options.onThinking] - Callback for thinking events
   */
  constructor(options) {
    // Use custom file manager if provided, otherwise fall back to global singleton
    const fm = options.fileManager || globalFileManager;
    
    /**
     * Tool executors map - defines how each tool is executed
     * @type {Object.<string, Function>}
     */
    const toolExecutors = {
      /**
       * Search the codebase for files matching a regex pattern
       * @param {Object} args - Search arguments
       * @param {string} args.pattern - Regex pattern to search for
       * @param {string} [args.path] - Base path to search in
       * @param {string} [args.file_pattern] - Glob pattern to filter files
       * @returns {Promise<Object>} Search results with matching files and lines
       */
      search_codebase: async (args) => {
        const result = await fm.searchFiles(args.pattern, {
          basePath: args.path,
          filePattern: args.file_pattern,
          maxResults: 50
        });
        return result;
      },
      
      /**
       * Read the contents of a file
       * @param {Object} args - Read arguments
       * @param {string} args.path - Path to the file to read
       * @param {string} [args.encoding='utf-8'] - File encoding
       * @returns {Promise<Object>} File content and metadata
       */
      read_file: async (args) => {
        const result = await fm.readFile(args.path, {
          encoding: args.encoding
        });
        
        // Truncate content if it exceeds safe size for API
        if (result.success && result.content && result.content.length > MAX_FILE_CONTENT_SIZE) {
          const originalSize = result.content.length;
          result.content = result.content.substring(0, MAX_FILE_CONTENT_SIZE) +
            `\n\n... [TRUNCATED: File content is ${originalSize} bytes, showing first ${MAX_FILE_CONTENT_SIZE} bytes]`;
          result.truncated = true;
          result.originalSize = originalSize;
        }
        
        return result;
      },
      
      /**
       * List contents of a directory
       * @param {Object} args - List arguments
       * @param {string} args.path - Path to the directory
       * @param {boolean} [args.recursive=false] - Whether to list recursively
       * @param {number} [args.max_depth=3] - Maximum depth for recursive listing
       * @returns {Promise<Object>} Directory listing with files and subdirectories
       */
      list_directory: async (args) => {
        const result = await fm.listDirectory(args.path, {
          recursive: args.recursive,
          maxDepth: args.max_depth
        });
        return result;
      },
      
      /**
       * Select files as relevant for the task (terminal tool)
       * This tool completes the context gathering process
       * @param {Object} args - Selection arguments
       * @param {Array<{path: string, relevance: string}>} args.files - Selected files with relevance explanations
       * @param {string} args.summary - Overall summary of the context
       * @returns {Object} Final selection result
       */
      select_files: async (args) => {
        return {
          files: args.files,
          summary: args.summary,
          totalFiles: args.files.length
        };
      }
    };
    
    super({
      ...options,
      role: 'context',
      systemPrompt: CONTEXT_AGENT_SYSTEM_PROMPT,
      tools: CONTEXT_AGENT_TOOLS,
      toolExecutors
    });
    
    // Store file manager reference for loadFileContents method
    this.fileManager = fm;
  }
  
  /**
   * Gather context for a task by discovering and selecting relevant files
   * 
   * This method orchestrates the context gathering process:
   * 1. Constructs a message describing the task and any hints
   * 2. Runs the agent to search and analyze the codebase
   * 3. Returns the selected files with relevance explanations
   * 
   * @param {string} taskDescription - Description of the task that needs context
   * @param {Object} [options={}] - Gathering options
   * @param {string} [options.projectPath=''] - Root path of the project to analyze
   * @param {string[]} [options.hints=[]] - Optional hints about relevant areas to focus on
   * @returns {Promise<ContextResult>} Context gathering result
   * 
   * @typedef {Object} ContextResult
   * @property {Array<{path: string, relevance: string}>} files - Selected relevant files
   * @property {string} summary - Summary explaining the context selection
   * @property {number} iterations - Number of agent iterations used
   * @property {number} duration - Time taken in milliseconds
   * 
   * @example
   * const result = await agent.gatherContext(
   *   'Implement user login with JWT tokens',
   *   {
   *     projectPath: '/app',
   *     hints: ['Check the auth folder', 'Look at existing middleware']
   *   }
   * );
   */
  async gatherContext(taskDescription, options = {}) {
    const { projectPath = '', hints = [] } = options;
    
    // Build the context gathering request message
    let message = `Task: ${taskDescription}\n`;
    
    if (projectPath) {
      message += `\nProject path: ${projectPath}\n`;
    }
    
    if (hints.length > 0) {
      message += `\nHints about relevant areas:\n${hints.map(h => `- ${h}`).join('\n')}\n`;
    }
    
    message += `\nPlease discover and select the relevant files for this task.`;
    
    // Run the agent to gather context
    const result = await this.run(message);
    
    // The final result should contain the selected files from select_files tool
    if (result.finalToolResult?.files) {
      return {
        files: result.finalToolResult.files,
        summary: result.finalToolResult.summary,
        iterations: result.iterations,
        duration: result.duration
      };
    }
    
    // Fallback if no files were explicitly selected via the tool
    return {
      files: [],
      summary: result.content,
      iterations: result.iterations,
      duration: result.duration
    };
  }
  
  /**
   * Load file metadata or content for selected files
   * 
   * After context gathering selects relevant files, this method can be used
   * to retrieve file information. By default, it returns only metadata (path, 
   * relevance, size) to keep context minimal. Workers can use read_file tool
   * to load file contents on-demand.
   * 
   * When loadContent=true, it loads actual file contents with truncation limits.
   * 
   * @param {Array<{path: string, relevance: string}>} files - Files to load info for
   * @param {Object} [options] - Loading options
   * @param {boolean} [options.loadContent=false] - Whether to load file content (default: false, returns metadata only)
   * @param {number} [options.maxFileSize=50000] - Maximum size per file in characters (default 50KB, only used when loadContent=true)
   * @param {number} [options.maxTotalSize=500000] - Maximum total context size in characters (default 500KB, only used when loadContent=true)
   * @returns {Promise<Array<LoadedFile>>} Files with metadata (and optionally content)
   * 
   * @typedef {Object} LoadedFile
   * @property {string} path - File path
   * @property {string} relevance - Why this file is relevant
   * @property {number} [size] - File size in bytes
   * @property {string|null} [content] - File content (only present when loadContent=true, null if error)
   * @property {boolean} [truncated] - Whether content was truncated (only present when loadContent=true)
   * @property {string} [error] - Error message if loading failed
   * 
   * @example
   * // Default: metadata only (keeps context tiny)
   * const context = await agent.gatherContext('Fix the login bug');
   * const filesMetadata = await agent.loadFileContents(context.files);
   * // Returns: [{ path: 'src/auth.js', relevance: '...', size: 1234 }, ...]
   * 
   * @example
   * // With content loading (for cases where full content is needed)
   * const filesWithContent = await agent.loadFileContents(context.files, { loadContent: true });
   * const workerContext = filesWithContent
   *   .filter(f => f.content)
   *   .map(f => `--- ${f.path} ---\n${f.content}`)
   *   .join('\n\n');
   */
  async loadFileContents(files, options = {}) {
    const { 
      loadContent = false,    // Default: metadata only, no content loading
      maxFileSize = 50000,    // 50KB per file (only used when loadContent=true)
      maxTotalSize = 500000   // 500KB total (only used when loadContent=true)
    } = options;
    
    const loaded = [];
    let totalSize = 0;
    
    for (const file of files) {
      // When not loading content, just get file metadata
      if (!loadContent) {
        try {
          const stats = await this.fileManager.getStats(file.path);
          
          if (stats.exists) {
            loaded.push({
              ...file,
              size: stats.size
            });
          } else {
            loaded.push({
              ...file,
              size: 0,
              error: 'File not found'
            });
          }
        } catch (error) {
          loaded.push({
            ...file,
            size: 0,
            error: error.message
          });
        }
        continue;
      }
      
      // loadContent=true: load actual file contents with truncation
      // Check if we've exceeded total context budget
      if (totalSize >= maxTotalSize) {
        console.log(`[ContextAgent] Total context limit reached (${totalSize} chars), skipping remaining files`);
        loaded.push({
          ...file,
          content: null,
          error: 'Skipped: total context size limit reached'
        });
        continue;
      }
      
      try {
        const result = await this.fileManager.readFile(file.path);
        
        if (result.success) {
          let content = result.content;
          let truncated = false;
          
          // Truncate individual file if too large
          if (content && content.length > maxFileSize) {
            content = content.slice(0, maxFileSize) + '\n\n... [TRUNCATED - file too large] ...';
            truncated = true;
            console.log(`[ContextAgent] Truncated ${file.path} from ${result.content.length} to ${maxFileSize} chars`);
          }
          
          // Check if adding this file would exceed total budget
          const remainingBudget = maxTotalSize - totalSize;
          if (content && content.length > remainingBudget) {
            content = content.slice(0, remainingBudget) + '\n\n... [TRUNCATED - context budget reached] ...';
            truncated = true;
            console.log(`[ContextAgent] Truncated ${file.path} to fit remaining budget (${remainingBudget} chars)`);
          }
          
          totalSize += content ? content.length : 0;
          
          loaded.push({
            ...file,
            content,
            size: result.metadata.size,
            truncated
          });
        } else {
          // File read returned an error result
          loaded.push({
            ...file,
            content: null,
            error: result.error
          });
        }
      } catch (error) {
        // Exception during file read - continue with other files
        loaded.push({
          ...file,
          content: null,
          error: error.message
        });
      }
    }
    
    if (loadContent) {
      console.log(`[ContextAgent] Loaded ${loaded.filter(f => f.content).length} files with content, total size: ${totalSize} chars`);
    } else {
      console.log(`[ContextAgent] Loaded metadata for ${loaded.filter(f => !f.error).length} files`);
    }
    
    return loaded;
  }
}

/**
 * Factory function to create and run a context agent in one step
 * 
 * This is a convenience function that creates a ContextAgent, gathers context,
 * and returns the result. Useful for one-off context gathering operations.
 * 
 * @param {string} apiKey - API key for the LLM provider
 * @param {string} taskDescription - Description of the task needing context
 * @param {Object} [options={}] - Options passed to both constructor and gatherContext
 * @param {string} [options.projectPath] - Root path of the project
 * @param {string[]} [options.hints] - Hints about relevant areas
 * @param {string} [options.model] - Model to use
 * @param {number} [options.maxIterations] - Maximum iterations
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @param {Function} [options.onToolCall] - Tool call callback
 * @param {Function} [options.onThinking] - Thinking event callback
 * @returns {Promise<ContextResult>} Context gathering result
 * 
 * @example
 * const context = await gatherContextForTask(
 *   process.env.API_KEY,
 *   'Add pagination to the users list',
 *   {
 *     projectPath: '/my-app',
 *     hints: ['Check the API routes', 'Look at existing list components']
 *   }
 * );
 * 
 * console.log(`Found ${context.files.length} relevant files`);
 * context.files.forEach(f => {
 *   console.log(`- ${f.path}: ${f.relevance}`);
 * });
 */
export async function gatherContextForTask(apiKey, taskDescription, options = {}) {
  const agent = new ContextAgent({
    apiKey,
    ...options
  });
  
  return await agent.gatherContext(taskDescription, options);
}
