import { EventEmitter } from 'events';
import { callKimi, buildToolResultMessage } from '../services/kimi.js';
import { v4 as uuidv4 } from 'uuid';
import { tokenTracker } from '../services/tokenTracker.js';

// Conversation size limits to prevent exceeding API limits
const MAX_CONVERSATION_SIZE = 2500000; // 2.5MB - leave buffer for API's 3.5MB limit
const MAX_TOOL_RESULT_SIZE = 100000;   // 100KB max per tool result
const TRUNCATION_MESSAGE = '\n\n... [CONTENT TRUNCATED TO FIT CONTEXT LIMIT]';

/**
 * Base class for all agents in the orchestration system.
 * Provides the core tool-calling loop with support for progress tracking,
 * cancellation, and state management.
 * 
 * @extends EventEmitter
 * @fires BaseAgent#progress - Emitted on state changes and tool execution
 * 
 * @example
 * const agent = new BaseAgent({
 *   role: 'worker',
 *   systemPrompt: 'You are a helpful assistant.',
 *   apiKey: process.env.KIMI_API_KEY,
 *   tools: [{ type: 'function', function: { name: 'search', ... } }],
 *   toolExecutors: {
 *     search: async (args, agent) => { ... }
 *   }
 * });
 * 
 * const result = await agent.run('Find information about X');
 */
export class BaseAgent extends EventEmitter {
  /**
   * Creates a new BaseAgent instance.
   * 
   * @param {Object} options - Agent configuration options
   * @param {string} [options.id] - Unique agent ID (auto-generated if not provided)
   * @param {string} options.role - Agent role (e.g., 'worker', 'verifier', 'context')
   * @param {string} options.systemPrompt - System prompt defining agent behavior
   * @param {Array<Object>} [options.tools=[]] - Array of tool definitions in OpenAI format
   * @param {string} options.apiKey - Kimi API key for LLM calls
   * @param {number} [options.maxIterations=100] - Maximum tool-calling iterations before timeout
   * @param {Object<string, Function>} [options.toolExecutors={}] - Map of tool name to executor function
   * @param {Function} [options.onProgress] - Callback for progress updates: (event) => void
   * @param {AbortSignal} [options.abortSignal] - Signal for cancellation support
   */
  constructor(options) {
    super();
    
    // Identity
    this.id = options.id || `agent-${uuidv4().slice(0, 8)}`;
    this.role = options.role;
    
    // Configuration
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools || [];
    this.apiKey = options.apiKey;
    this.maxIterations = options.maxIterations || 100;
    this.toolExecutors = options.toolExecutors || {};
    this.onProgress = options.onProgress;
    this.abortSignal = options.abortSignal;
    
    // State - initialized via reset()
    this.status = 'idle';
    this.conversationHistory = [];
    this.iterations = 0;
    this.startTime = null;
    this.endTime = null;
    this.result = null;
    this.error = null;
    
    // Token tracking
    this.tokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      calls: 0,
    };
  }
  
  /**
   * Resets the agent state for reuse.
   * Clears conversation history, iterations, timing, results, and errors.
   * Does not modify configuration (tools, executors, etc.).
   * 
   * @returns {this} The agent instance for chaining
   * 
   * @example
   * agent.reset().run('New task');
   */
  reset() {
    this.status = 'idle';
    this.conversationHistory = [];
    this.iterations = 0;
    this.startTime = null;
    this.endTime = null;
    this.result = null;
    this.error = null;
    this.tokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      calls: 0,
    };
    return this;
  }
  
  /**
   * Main execution method - runs the tool-calling loop until completion.
   * 
   * The agent will:
   * 1. Send the user message to the LLM with available tools
   * 2. If the LLM requests tool calls, execute them and continue
   * 3. If the LLM responds without tool calls, return the response
   * 4. If a terminal tool is called, return immediately with its result
   * 
   * @param {string} userMessage - Initial user message/task description
   * @returns {Promise<Object>} Execution result
   * @returns {string} result.content - Final text response from the agent
   * @returns {Array<Object>} result.toolsUsed - List of tools called with args
   * @returns {number} result.iterations - Number of LLM call iterations
   * @returns {number} result.duration - Total execution time in milliseconds
   * @returns {*} [result.finalToolResult] - Result from terminal tool if applicable
   * 
   * @throws {Error} If cancelled via abortSignal
   * @throws {Error} If max iterations reached
   * @throws {Error} If LLM call fails
   * 
   * @example
   * const result = await agent.run('Analyze the codebase structure');
   * console.log(result.content); // Final analysis
   * console.log(result.toolsUsed); // [{ name: 'read_file', args: {...}, iteration: 1 }, ...]
   */
   async run(userMessage) {
    this.status = 'running';
    this.startTime = Date.now();
    this.iterations = 0;
    
    // Initialize conversation with system prompt and user message
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userMessage }
    ];
    
    console.log(`\n[${this.id}] ===== AGENT STARTING (role: ${this.role}) =====`);
    console.log(`[${this.id}] System prompt: ${this.systemPrompt.length} chars`);
    console.log(`[${this.id}] User message: ${userMessage.length} chars`);
    console.log(`[${this.id}] Available tools: ${this.tools.map(t => t.function.name).join(', ')}`);
    
    // Emit agent started event with full details for UI
    this.emitProgress('agent_started', {
      task: userMessage,
      systemPrompt: this.systemPrompt,
      tools: this.tools.map(t => t.function.name),
    });
    
    const toolsUsed = [];
    
    try {
      while (this.iterations < this.maxIterations) {
        // Check for cancellation before each iteration
        if (this.abortSignal?.aborted) {
          this.status = 'cancelled';
          throw new Error('Agent cancelled');
        }
        
        this.iterations++;
        
        // Log context size at each iteration
        const historySize = JSON.stringify(this.conversationHistory).length;
        console.log(`[${this.id}] --- Iteration ${this.iterations} --- History: ${this.conversationHistory.length} msgs, ${Math.round(historySize/1024)}KB`);
        
        this.emitProgress('calling_llm', { 
          iteration: this.iterations,
          historyMessages: this.conversationHistory.length,
          historySizeKB: Math.round(historySize / 1024)
        });
        
        // Call Kimi with tools (only if tools are defined)
        const response = await callKimi(this.apiKey, this.conversationHistory, {
          tools: this.tools.length > 0 ? this.tools : undefined,
          toolChoice: this.tools.length > 0 ? 'auto' : undefined
        });
        
        // Track token usage for this agent
        if (response.usage) {
          this.tokenUsage.prompt_tokens += response.usage.prompt_tokens || 0;
          this.tokenUsage.completion_tokens += response.usage.completion_tokens || 0;
          this.tokenUsage.total_tokens += response.usage.total_tokens || 0;
          this.tokenUsage.calls += 1;
          
          // Report to global token tracker
          tokenTracker.addUsage(this.id, this.role, response.usage);
          
          console.log(`[${this.id}] Tokens: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}, total_accumulated=${this.tokenUsage.total_tokens}`);
          
          this.emitProgress('token_usage', {
            usage: response.usage,
            accumulated: { ...this.tokenUsage },
          });
        }
        
        // Check for tool calls in response
        if (!response.toolCalls || response.toolCalls.length === 0) {
          // No tools called - agent has finished reasoning
          console.log(`[${this.id}] No tool calls - completing with response`);
          this.status = 'completed';
          this.endTime = Date.now();
          this.result = {
            content: response.content,
            toolsUsed,
            iterations: this.iterations,
            duration: this.endTime - this.startTime,
            tokenUsage: { ...this.tokenUsage },
          };
          
          // Emit thinking/response content for UI
          this.emitProgress('agent_thinking', {
            content: response.content,
            iteration: this.iterations,
          });
          
          this.emitProgress('completed', this.result);
          return this.result;
        }
        
        // Emit assistant's thinking/response before tool calls (if any content)
        if (response.content) {
          this.emitProgress('agent_thinking', {
            content: response.content,
            iteration: this.iterations,
          });
        }
        
        // Log tool calls
        console.log(`[${this.id}] Tool calls: ${response.toolCalls.map(tc => tc.function.name).join(', ')}`);
        
        // Add assistant message with tool calls to history
        this.conversationHistory.push(response.message);
        
        // Compress history if approaching limits
        this.compressConversationHistory();
        
        // Execute each tool call sequentially
        for (const toolCall of response.toolCalls) {
          // Check for cancellation between tool calls
          if (this.abortSignal?.aborted) {
            this.status = 'cancelled';
            throw new Error('Agent cancelled');
          }
          
          const toolName = toolCall.function.name;
          let toolArgs;
          
          // Parse tool arguments safely
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (parseError) {
            // Handle malformed JSON from LLM
            toolArgs = {};
            this.emitProgress('tool_error', { 
              tool: toolName, 
              error: `Failed to parse tool arguments: ${parseError.message}` 
            });
          }
          
          console.log(`[${this.id}] Executing: ${toolName} with args: ${JSON.stringify(toolArgs).slice(0, 200)}...`);
          
          this.emitProgress('executing_tool', { 
            tool: toolName, 
            args: toolArgs,
            iteration: this.iterations 
          });
          toolsUsed.push({ name: toolName, args: toolArgs, iteration: this.iterations });
          
          try {
            const startTime = Date.now();
            const result = await this.executeTool(toolName, toolArgs);
            const duration = Date.now() - startTime;
            
            // Log result size before truncation
            const resultSize = JSON.stringify(result).length;
            console.log(`[${this.id}] Tool ${toolName} returned ${Math.round(resultSize/1024)}KB in ${duration}ms`);
            
            // Truncate large tool results before adding to history
            const truncatedResult = this.truncateToolResult(result);
            const truncatedSize = JSON.stringify(truncatedResult).length;
            
            if (truncatedSize < resultSize) {
              console.log(`[${this.id}] Truncated: ${Math.round(resultSize/1024)}KB -> ${Math.round(truncatedSize/1024)}KB`);
            }
            
            // Add tool result to conversation history
            this.conversationHistory.push(
              buildToolResultMessage(toolCall.id, truncatedResult)
            );
            
            // Log new history size
            const newHistorySize = JSON.stringify(this.conversationHistory).length;
            console.log(`[${this.id}] History now: ${Math.round(newHistorySize/1024)}KB`);
            
            this.emitProgress('tool_completed', { 
              tool: toolName, 
              success: true,
              result: truncatedResult,
              resultSizeKB: Math.round(resultSize/1024),
              truncatedSizeKB: Math.round(truncatedSize/1024),
              durationMs: duration,
              historySizeKB: Math.round(newHistorySize/1024),
              iteration: this.iterations
            });
            
            // Check if this tool terminates the agent
            if (this.isTerminalTool(toolName, result)) {
              console.log(`[${this.id}] Terminal tool ${toolName} called - completing`);
              this.status = 'completed';
              this.endTime = Date.now();
              this.result = {
                content: typeof result === 'object' 
                  ? (result.summary || JSON.stringify(result)) 
                  : String(result),
                toolsUsed,
                iterations: this.iterations,
                duration: this.endTime - this.startTime,
                finalToolResult: result,
                tokenUsage: { ...this.tokenUsage },
              };
              
              this.emitProgress('completed', this.result);
              return this.result;
            }
          } catch (toolError) {
            console.error(`[${this.id}] Tool ${toolName} error:`, toolError.message);
            // Add error to history so the agent can recover/retry
            this.conversationHistory.push(
              buildToolResultMessage(toolCall.id, { error: toolError.message })
            );
            
            this.emitProgress('tool_error', { tool: toolName, error: toolError.message });
            // Continue loop - let the LLM decide how to handle the error
          }
        }
      }
      
      // Max iterations reached without completion
      console.log(`[${this.id}] Max iterations (${this.maxIterations}) reached!`);
      this.status = 'error';
      this.endTime = Date.now();
      this.error = new Error(`Max iterations (${this.maxIterations}) reached`);
      throw this.error;
      
    } catch (error) {
      // Set error state if not already cancelled
      if (this.status !== 'cancelled') {
        this.status = 'error';
        this.error = error;
      }
      this.endTime = Date.now();
      console.error(`[${this.id}] Agent error:`, error.message);
      this.emitProgress('error', { error: error.message, recoverable: true });
      throw error;
    }
  }
  
  /**
   * Executes a tool by name with the given arguments.
   * Override in subclasses for custom tool handling or middleware.
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} args - Arguments to pass to the tool executor
   * @returns {Promise<*>} Result from the tool executor
   * @throws {Error} If no executor is registered for the tool
   * 
   * @example
   * // Override for custom handling
   * async executeTool(toolName, args) {
   *   console.log(`Executing: ${toolName}`);
   *   return super.executeTool(toolName, args);
   * }
   */
  async executeTool(toolName, args) {
    const executor = this.toolExecutors[toolName];
    if (!executor) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    // Pass agent instance for context (allows tools to access agent state)
    return await executor(args, this);
  }
  
  /**
   * Determines if a tool call should terminate the agent loop.
   * Override in subclasses for custom terminal conditions.
   * 
   * @param {string} toolName - Name of the tool that was called
   * @param {*} result - Result returned from the tool
   * @returns {boolean} True if the agent should stop after this tool
   * 
   * @example
   * // Override to add custom terminal tools
   * isTerminalTool(toolName, result) {
   *   if (toolName === 'my_custom_complete') return true;
   *   return super.isTerminalTool(toolName, result);
   * }
   */
  isTerminalTool(toolName, result) {
    // Default terminal tools that signal task completion
    const terminalTools = [
      'mark_complete',
      'complete_task', 
      'select_files',
      'report_issues',
      'generate_summary',
      'document_findings'
    ];
    return terminalTools.includes(toolName);
  }
  
  /**
   * Emits a progress event to listeners and optional callback.
   * 
   * @param {string} type - Event type (e.g., 'calling_llm', 'executing_tool', 'completed')
   * @param {Object} [data={}] - Additional event data
   * @fires BaseAgent#progress
   * 
   * @example
   * agent.on('progress', (event) => {
   *   console.log(`[${event.agentId}] ${event.type}:`, event);
   * });
   */
  emitProgress(type, data = {}) {
    /**
     * Progress event containing agent state updates.
     * @event BaseAgent#progress
     * @type {Object}
     * @property {string} type - Event type
     * @property {string} agentId - ID of the agent
     * @property {string} role - Role of the agent
     * @property {string} timestamp - ISO timestamp of the event
     */
    const event = {
      type,
      agentId: this.id,
      role: this.role,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    this.emit('progress', event);
    
    // Also call callback if provided
    if (this.onProgress) {
      this.onProgress(event);
    }
  }
  
  /**
   * Truncate a tool result if it exceeds the maximum size.
   * Intelligently handles objects by truncating known large fields.
   * 
   * @param {Object|string} result - The tool result to potentially truncate
   * @returns {Object|string} The truncated result
   * @private
   */
  truncateToolResult(result) {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    
    if (resultStr.length <= MAX_TOOL_RESULT_SIZE) {
      return result;
    }
    
    console.log(`[${this.id}] Truncating tool result: ${Math.round(resultStr.length/1024)}KB -> ${Math.round(MAX_TOOL_RESULT_SIZE/1024)}KB`);
    
    // For objects, try to truncate content fields intelligently
    if (typeof result === 'object' && result !== null) {
      const truncated = JSON.parse(JSON.stringify(result)); // Deep clone
      truncated._truncated = true;
      
      // Truncate common large fields
      if (truncated.content && typeof truncated.content === 'string' && truncated.content.length > 50000) {
        truncated.content = truncated.content.substring(0, 50000) + TRUNCATION_MESSAGE;
      }
      
      // Handle files array (common in context/analysis tools)
      if (truncated.files && Array.isArray(truncated.files)) {
        truncated.files = truncated.files.map(f => {
          if (f.content && typeof f.content === 'string' && f.content.length > 30000) {
            return { ...f, content: f.content.substring(0, 30000) + TRUNCATION_MESSAGE, _truncated: true };
          }
          return f;
        });
      }
      
      // Handle matches array (common in search results)
      if (truncated.matches && Array.isArray(truncated.matches) && truncated.matches.length > 50) {
        truncated.matches = truncated.matches.slice(0, 50);
        truncated._matchesTruncated = true;
      }
      
      return truncated;
    }
    
    // For strings, just truncate
    return resultStr.substring(0, MAX_TOOL_RESULT_SIZE) + TRUNCATION_MESSAGE;
  }
  
  /**
   * Compress conversation history when approaching size limits.
   * Summarizes or removes older tool results while keeping structure intact.
   * @private
   */
  compressConversationHistory() {
    const currentSize = JSON.stringify(this.conversationHistory).length;
    
    if (currentSize < MAX_CONVERSATION_SIZE) {
      return; // No compression needed
    }
    
    console.log(`[${this.id}] Compressing conversation history: ${Math.round(currentSize/1024)}KB -> targeting ${Math.round(MAX_CONVERSATION_SIZE/1024)}KB`);
    
    // Find tool result messages and compress older ones (keep last 5 messages intact)
    const messagesToKeep = 5;
    for (let i = 0; i < this.conversationHistory.length - messagesToKeep; i++) {
      const msg = this.conversationHistory[i];
      
      // Skip system and user messages
      if (msg.role === 'system' || msg.role === 'user') {
        continue;
      }
      
      // Compress tool results
      if (msg.role === 'tool' && msg.content) {
        try {
          const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          
          // Replace large content with summary
          if (content.content && typeof content.content === 'string' && content.content.length > 1000) {
            content.content = `[Compressed: ${content.content.length} chars of file content]`;
            content._compressed = true;
          }
          
          // Compress files array
          if (content.files && Array.isArray(content.files)) {
            content.files = content.files.map(f => ({
              path: f.path,
              size: f.size,
              relevance: f.relevance,
              _compressed: true
            }));
          }
          
          // Compress matches array
          if (content.matches && Array.isArray(content.matches)) {
            content.matches = content.matches.slice(0, 5).map(m => ({
              file: m.file,
              line: m.line,
              _compressed: true
            }));
          }
          
          msg.content = JSON.stringify(content);
        } catch (e) {
          // If not JSON, truncate string content
          if (typeof msg.content === 'string' && msg.content.length > 1000) {
            msg.content = msg.content.substring(0, 500) + '\n...[Compressed]...\n' + msg.content.slice(-200);
          }
        }
      }
      
      // Compress assistant messages with large content
      if (msg.role === 'assistant' && msg.content && msg.content.length > 2000) {
        msg.content = msg.content.substring(0, 1000) + '\n...[Compressed]...\n' + msg.content.slice(-500);
      }
    }
    
    const newSize = JSON.stringify(this.conversationHistory).length;
    console.log(`[${this.id}] Conversation compressed: ${Math.round(currentSize/1024)}KB -> ${Math.round(newSize/1024)}KB`);
  }
  
  /**
   * Gets the current agent state for serialization/persistence.
   * 
   * @returns {Object} Serializable agent state
   * @returns {string} state.id - Agent ID
   * @returns {string} state.role - Agent role
   * @returns {string} state.status - Current status
   * @returns {number} state.iterations - Number of iterations completed
   * @returns {number|null} state.startTime - Start timestamp (ms since epoch)
   * @returns {number|null} state.endTime - End timestamp (ms since epoch)
   * @returns {number|null} state.duration - Total duration in milliseconds
   * @returns {Object|null} state.result - Execution result if completed
   * @returns {string|undefined} state.error - Error message if failed
   */
  getState() {
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      iterations: this.iterations,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? this.endTime - this.startTime : null,
      result: this.result,
      error: this.error?.message,
      tokenUsage: { ...this.tokenUsage },
    };
  }
  
  /**
   * Queries the agent about its completed work.
   * Uses the existing conversation history to provide contextual answers.
   * 
   * @param {string} question - Question about the agent's previous work
   * @returns {Promise<string>} Answer from the agent
   * @throws {Error} If agent is not in 'completed' status
   * 
   * @example
   * const result = await agent.run('Analyze security vulnerabilities');
   * const answer = await agent.query('What was the most critical issue found?');
   */
  async query(question) {
    if (this.status !== 'completed') {
      throw new Error(`Cannot query agent in status: ${this.status}`);
    }
    
    // Build query on top of existing conversation
    const queryHistory = [
      ...this.conversationHistory,
      { role: 'user', content: `Question about your previous work: ${question}` }
    ];
    
    // Call without tools - just get an answer
    const response = await callKimi(this.apiKey, queryHistory, {
      // No tools for queries
    });
    
    // Track tokens from query
    if (response.usage) {
      this.tokenUsage.prompt_tokens += response.usage.prompt_tokens || 0;
      this.tokenUsage.completion_tokens += response.usage.completion_tokens || 0;
      this.tokenUsage.total_tokens += response.usage.total_tokens || 0;
      this.tokenUsage.calls += 1;
      
      tokenTracker.addUsage(this.id, this.role, response.usage);
    }
    
    return response.content;
  }
}
