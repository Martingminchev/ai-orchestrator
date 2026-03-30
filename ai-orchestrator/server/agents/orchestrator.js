/**
 * Orchestrator - The lean coordinator
 * 
 * This orchestrator ONLY coordinates via tools - it never does work directly.
 * It receives summaries from agents, makes strategic decisions, and delegates
 * all actual work to specialized agents through tool calls.
 * 
 * Key Principles:
 * 1. NEVER does work directly - only coordinates via tools
 * 2. Keeps minimal context - receives summaries, not full details
 * 3. Makes strategic decisions about what work is needed
 * 4. Uses native tool calling (not JSON parsing from prompts)
 * 5. Runs in a loop up to maxIterations (default: 100)
 * 
 * Available Tools:
 * - request_work(expertise, task, priority, context_hints) - Delegate to Assigner
 * - request_improvement(topic, depth, focus_areas) - Deep research
 * - request_supervision(scope, agent_ids) - Review completed work
 * - call_user(message, expect_response, options, type) - User interaction (blocking)
 * - query_agent(agent_id, question) - Ask completed agent about their work
 * - complete_task(summary, deliverables) - Mark task done
 * 
 * @module agents/orchestrator
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { callKimi, buildToolResultMessage } from '../services/kimi.js';
import { ORCHESTRATOR_TOOLS } from './tools/definitions.js';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts.js';
import { Assigner } from './assigner.js';
import { SupervisorAgent, superviseWork } from './supervisorAgent.js';
import { ImprovementsAgent, researchTopic } from './improvementsAgent.js';
import { agentRegistry } from './agentRegistry.js';
import { resultsManager } from '../services/resultsManager.js';
import { workArchive } from '../services/workArchive.js';
import { tokenTracker } from '../services/tokenTracker.js';

/**
 * Default maximum iterations before forcing completion
 * @constant {number}
 */
const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Orchestrator - The lean coordinator
 * 
 * Only coordinates via tools, never does work directly.
 * Receives summaries from agents, makes strategic decisions.
 * 
 * @extends EventEmitter
 * 
 * @fires Orchestrator#progress - Progress events during orchestration
 * 
 * @example
 * const orchestrator = new Orchestrator({
 *   apiKey: 'your-api-key',
 *   taskId: 'task-123',
 *   onUserInteraction: async (request) => {
 *     // Handle user interaction
 *     return userResponse;
 *   }
 * });
 * 
 * const result = await orchestrator.run('Build a REST API for user management');
 */
export class Orchestrator extends EventEmitter {
  /**
   * Create a new Orchestrator instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Kimi API key for LLM calls
   * @param {string} [options.taskId] - Unique task identifier (auto-generated if not provided)
   * @param {string} options.projectName - Name of the project to work in (required)
   * @param {Function} [options.onUserInteraction] - Callback for call_user tool (must return Promise)
   * @param {Function} [options.onProgress] - Progress callback for events
   * @param {AbortSignal} [options.abortSignal] - Cancellation signal for aborting the task
   * @param {number} [options.maxIterations=100] - Maximum iterations before forcing completion
   */
  constructor(options) {
    super();
    
    if (!options.apiKey) {
      throw new Error('apiKey is required');
    }
    if (!options.projectName) {
      throw new Error('projectName is required');
    }
    
    this.apiKey = options.apiKey;
    this.taskId = options.taskId || `task-${uuidv4().slice(0, 8)}`;
    this.projectName = options.projectName;
    this.onUserInteraction = options.onUserInteraction;
    this.onProgress = options.onProgress;
    this.abortSignal = options.abortSignal;
    this.maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
    
    // State management
    this.status = 'idle';
    this.iterations = 0;
    this.conversationHistory = [];
    this.completedAgents = [];  // Track agents for query_agent tool
    
    // Create Assigner for delegating work
    this.assigner = new Assigner({
      apiKey: this.apiKey,
      taskId: this.taskId,
      projectName: this.projectName,
      onProgress: (event) => this.emitProgress('assigner', event),
      abortSignal: this.abortSignal
    });
  }
  
  /**
   * Run the orchestrator on a task
   * 
   * This is the main entry point. The orchestrator will:
   * 1. Initialize the task and conversation
   * 2. Loop calling the LLM with tools until complete_task is called
   * 3. Execute tool calls and feed results back to the LLM
   * 4. Return the final result when complete
   * 
   * @param {string} userTask - The user's task description
   * @returns {Promise<OrchestratorResult>} The result of the orchestration
   * 
   * @typedef {Object} OrchestratorResult
   * @property {boolean} success - Whether the task completed successfully
   * @property {string} [summary] - Summary of completed work (if successful)
   * @property {Array<Object>} [deliverables] - List of deliverables (if successful)
   * @property {string} [error] - Error message (if failed)
   * @property {number} iterations - Number of iterations executed
   */
  async run(userTask) {
    this.status = 'running';
    this.iterations = 0;
    
    // Initialize results folder for this task
    await resultsManager.createTaskFolder(this.taskId);
    
    // Initialize conversation with system prompt and user task
    this.conversationHistory = [
      { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
      { role: 'user', content: userTask }
    ];
    
    this.emitProgress('started', { 
      task: userTask,
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: ORCHESTRATOR_TOOLS.map(t => t.function.name)
    });
    
    try {
      // Main orchestration loop
      while (this.iterations < this.maxIterations) {
        // Check for cancellation
        if (this.abortSignal?.aborted) {
          this.status = 'cancelled';
          throw new Error('Task cancelled');
        }
        
        this.iterations++;
        
        // Calculate and log context size before each iteration
        const historySize = JSON.stringify(this.conversationHistory).length;
        const historySizeKB = Math.round(historySize / 1024);
        console.log(`\n[Orchestrator] ===== ITERATION ${this.iterations} =====`);
        console.log(`[Orchestrator] Conversation history: ${this.conversationHistory.length} messages, ${historySizeKB}KB`);
        
        this.emitProgress('iteration', { 
          iteration: this.iterations,
          historyMessages: this.conversationHistory.length,
          historySizeKB
        });
        
        // Call Kimi with tools
        const response = await callKimi(this.apiKey, this.conversationHistory, {
          tools: ORCHESTRATOR_TOOLS,
          toolChoice: 'auto'
        });
        
        // Track token usage
        if (response.usage) {
          tokenTracker.addUsage({
            source: 'orchestrator',
            ...response.usage
          });
          console.log(`[Orchestrator] Token usage: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}`);
        }
        
        // Check for tool calls
        if (!response.toolCalls || response.toolCalls.length === 0) {
          // No tools called - orchestrator gave a direct response
          // This is typically a conversational response (greeting, clarification, etc.)
          // Return it to the user instead of continuing the loop
          console.log(`[Orchestrator] Direct response (no tools): ${response.content?.slice(0, 200)}...`);
          
          // Emit thinking content for UI
          this.emitProgress('thinking', { 
            content: response.content,
            iteration: this.iterations
          });
          
          this.emitProgress('direct_response', { content: response.content });
          
          // Return the direct response to the user
          this.status = 'completed';
          return {
            success: true,
            summary: response.content,
            directResponse: true,
            iterations: this.iterations
          };
        }
        
        // Emit orchestrator's thinking/reasoning before tool calls (if any content)
        if (response.content) {
          this.emitProgress('thinking', { 
            content: response.content,
            iteration: this.iterations
          });
        }
        
        // Log all tool calls for this iteration
        console.log(`[Orchestrator] Tool calls requested: ${response.toolCalls.map(tc => tc.function.name).join(', ')}`);
        
        // Add assistant message with tool calls to history
        this.conversationHistory.push(response.message);
        
        // Execute each tool call sequentially
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.function.name;
          let toolArgs;
          
          // Parse tool arguments
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            console.error(`[Orchestrator] Failed to parse args for ${toolName}:`, toolCall.function.arguments);
            // Invalid JSON in tool arguments - report error to LLM
            this.conversationHistory.push(
              buildToolResultMessage(toolCall.id, { 
                error: 'Invalid tool arguments - could not parse JSON',
                rawArguments: toolCall.function.arguments
              })
            );
            continue;
          }
          
          // Detailed logging for each tool call
          console.log(`[Orchestrator] Executing: ${toolName}`);
          console.log(`[Orchestrator]   Args: ${JSON.stringify(toolArgs).slice(0, 500)}`);
          
          this.emitProgress('tool_call', { 
            tool: toolName, 
            args: toolArgs,
            iteration: this.iterations 
          });
          
          try {
            const startTime = Date.now();
            // Execute the tool
            const result = await this.executeTool(toolName, toolArgs);
            const duration = Date.now() - startTime;
            
            // Log result size
            const resultSize = JSON.stringify(result).length;
            console.log(`[Orchestrator]   Result: ${Math.round(resultSize / 1024)}KB in ${duration}ms`);
            
            // Emit detailed tool result event
            this.emitProgress('tool_result', {
              tool: toolName,
              result: result,
              resultSizeKB: Math.round(resultSize / 1024),
              durationMs: duration,
              success: !result.error,
              iteration: this.iterations
            });
            
            // Add tool result to conversation history
            this.conversationHistory.push(
              buildToolResultMessage(toolCall.id, result)
            );
            
            // Log updated history size
            const newHistorySize = JSON.stringify(this.conversationHistory).length;
            console.log(`[Orchestrator]   History now: ${Math.round(newHistorySize / 1024)}KB`);
            
            // Check if task is complete
            if (toolName === 'complete_task') {
              this.status = 'completed';
              
              const finalResult = {
                success: true,
                summary: toolArgs.summary,
                deliverables: toolArgs.deliverables || [],
                iterations: this.iterations
              };
              
              // Save final result to disk
              await resultsManager.saveFinalOutput(this.taskId, finalResult);
              
              this.emitProgress('completed', finalResult);
              return finalResult;
            }
            
          } catch (toolError) {
            console.error(`[Orchestrator] Tool error in ${toolName}:`, toolError.message);
            // Add error to history so orchestrator can recover
            this.conversationHistory.push(
              buildToolResultMessage(toolCall.id, { 
                error: toolError.message,
                errorType: toolError.name || 'Error'
              })
            );
            
            this.emitProgress('tool_error', { 
              tool: toolName, 
              error: toolError.message 
            });
          }
        }
      }
      
      // Max iterations reached without completing
      this.status = 'error';
      throw new Error(`Max iterations (${this.maxIterations}) reached without completing task`);
      
    } catch (error) {
      if (this.status !== 'cancelled') {
        this.status = 'error';
      }
      
      console.error('[Orchestrator] Error during execution:', error.message);
      console.error('[Orchestrator] Stack:', error.stack);
      
      this.emitProgress('error', { error: error.message, stack: error.stack });
      
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        iterations: this.iterations
      };
    }
  }
  
  /**
   * Execute a tool by name
   * 
   * Routes tool calls to the appropriate handler method.
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} args - Arguments for the tool
   * @returns {Promise<Object>} Result of the tool execution
   * @throws {Error} If the tool name is unknown
   * @private
   */
  async executeTool(toolName, args) {
    switch (toolName) {
      case 'request_work':
        return await this.handleRequestWork(args);
        
      case 'request_improvement':
        return await this.handleRequestImprovement(args);
        
      case 'request_supervision':
        return await this.handleRequestSupervision(args);
        
      case 'call_user':
        return await this.handleCallUser(args);
        
      case 'query_agent':
        return await this.handleQueryAgent(args);
      
      case 'request_extended_summary':
        return await this.handleRequestExtendedSummary(args);
        
      case 'complete_task':
        // Just return acknowledgment - completion is handled in the main loop
        return { 
          acknowledged: true, 
          summary: args.summary 
        };
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
  
  /**
   * Handle request_work tool
   * 
   * Delegates work to the Assigner, which will spawn appropriate worker agents.
   * 
   * @param {Object} args - Tool arguments
   * @param {string} args.expertise - Required expertise (e.g., 'backend', 'frontend')
   * @param {string} args.task - Description of the task to perform
   * @param {string} [args.priority='medium'] - Priority level ('low', 'medium', 'high', 'critical')
   * @param {Array<string>} [args.context_hints=[]] - Hints about relevant context
   * @returns {Promise<Object>} Summary of the work performed
   * @private
   */
  async handleRequestWork(args) {
    const { expertise, task, priority, context_hints } = args;
    
    this.emitProgress('delegating_work', { expertise, task });
    
    const result = await this.assigner.handleWorkRequest({
      expertise,
      task,
      priority: priority || 'medium',
      contextHints: context_hints || []
    });
    
    // Track completed agent for later queries
    if (result.agentId) {
      this.completedAgents.push(result.agentId);
    }
    
    return result;
  }
  
  /**
   * Handle request_improvement tool
   * 
   * Initiates deep research on a topic using the ImprovementsAgent.
   * 
   * @param {Object} args - Tool arguments
   * @param {string} args.topic - Topic to research
   * @param {string} [args.depth='medium'] - Research depth ('shallow', 'medium', 'deep')
   * @param {Array<string>} [args.focus_areas=[]] - Specific areas to focus on
   * @returns {Promise<Object>} Summary of research findings
   * @private
   */
  async handleRequestImprovement(args) {
    const { topic, depth, focus_areas } = args;
    
    this.emitProgress('requesting_improvement', { topic, depth });
    
    const result = await researchTopic(this.apiKey, {
      topic,
      depth: depth || 'medium',
      focusAreas: focus_areas || [],
      onProgress: (event) => this.emitProgress('improvement_progress', event),
      abortSignal: this.abortSignal
    });
    
    // Return summarized result to keep context minimal
    return {
      topic: result.topic,
      summary: result.summary,
      findingsCount: result.findings?.length || 0,
      recommendations: result.recommendations?.slice(0, 5) || []  // Limit for context
    };
  }
  
  /**
   * Handle request_supervision tool
   * 
   * Reviews completed work from agents using the SupervisorAgent.
   * 
   * @param {Object} args - Tool arguments
   * @param {string} args.scope - Description of what to supervise
   * @param {Array<string>} [args.agent_ids] - Specific agent IDs to review (defaults to all completed)
   * @returns {Promise<Object>} Supervision summary and recommendations
   * @private
   */
  async handleRequestSupervision(args) {
    const { scope, agent_ids } = args;
    
    this.emitProgress('requesting_supervision', { 
      scope, 
      agentCount: agent_ids?.length 
    });
    
    // Gather outputs from specified agents (or all completed agents)
    const agentOutputs = [];
    const agentIdsToReview = agent_ids || this.completedAgents;
    
    for (const agentId of agentIdsToReview) {
      const record = agentRegistry.get(agentId);
      if (record) {
        agentOutputs.push({
          agentId: record.id,
          role: record.role,
          expertise: record.expertise,
          result: record.result,
          filesModified: record.result?.finalToolResult?.filesModified || [],
          filesCreated: record.result?.finalToolResult?.filesCreated || []
        });
      }
    }
    
    const result = await superviseWork(this.apiKey, {
      agentOutputs,
      taskDescription: scope,
      onProgress: (event) => this.emitProgress('supervision_progress', event),
      abortSignal: this.abortSignal
    });
    
    return {
      summary: result.summary,
      recommendations: result.recommendations || [],
      conflicts: result.conflicts || [],
      filesModified: result.filesModified || [],
      filesCreated: result.filesCreated || []
    };
  }
  
  /**
   * Handle call_user tool - BLOCKING
   * 
   * This tool blocks execution until the user responds.
   * Used for clarifying questions, confirmations, or presenting options.
   * 
   * @param {Object} args - Tool arguments
   * @param {string} args.message - Message to show the user
   * @param {boolean} [args.expect_response=true] - Whether to wait for a response
   * @param {Array<string>} [args.options] - Options to present to the user
   * @param {string} [args.type='question'] - Type of interaction ('question', 'confirmation', 'choice')
   * @returns {Promise<Object>} User's response
   * @private
   */
  async handleCallUser(args) {
    const { 
      message, 
      expect_response = true, 
      options, 
      type = 'question' 
    } = args;
    
    this.emitProgress('calling_user', { 
      message, 
      type, 
      expectResponse: expect_response 
    });
    
    // Check if user interaction handler is available
    if (!this.onUserInteraction) {
      return {
        error: 'User interaction not available - no handler configured',
        response: null
      };
    }
    
    // This blocks until user responds
    const userResponse = await this.onUserInteraction({
      message,
      expectResponse: expect_response,
      options: options || [],
      type
    });
    
    this.emitProgress('user_responded', { response: userResponse });
    
    return {
      response: userResponse,
      acknowledged: true
    };
  }
  
  /**
   * Handle query_agent tool
   * 
   * Allows the orchestrator to ask a completed agent questions about their work.
   * Useful for getting additional details without re-running the entire task.
   * 
   * @param {Object} args - Tool arguments
   * @param {string} args.agent_id - ID of the agent to query
   * @param {string} args.question - Question to ask the agent
   * @returns {Promise<Object>} Agent's answer
   * @private
   */
  async handleQueryAgent(args) {
    const { agent_id, question } = args;
    
    this.emitProgress('querying_agent', { agentId: agent_id, question });
    
    try {
      const answer = await agentRegistry.queryAgent(agent_id, question);
      return {
        agentId: agent_id,
        answer,
        success: true
      };
    } catch (error) {
      return {
        agentId: agent_id,
        error: error.message,
        success: false
      };
    }
  }
  
  /**
   * Handle request_extended_summary tool
   * 
   * Retrieves archived work details and generates an extended summary
   * for specific aspects the orchestrator needs more information about.
   * 
   * @param {Object} args - Tool arguments
   * @param {string} args.agent_id - ID of the worker to get details from
   * @param {Array<string>} args.aspects - Specific aspects to elaborate on
   * @returns {Promise<Object>} Extended summary
   * @private
   */
  async handleRequestExtendedSummary(args) {
    const { agent_id, aspects } = args;
    
    this.emitProgress('requesting_extended_summary', { agentId: agent_id, aspects });
    
    try {
      // First, try to get the archived full output
      const fullOutput = await workArchive.getWorkerFullOutput(this.taskId, agent_id);
      
      if (!fullOutput) {
        return {
          agentId: agent_id,
          error: 'No archived work found for this agent',
          success: false
        };
      }
      
      // Generate an extended summary using LLM based on the full output and requested aspects
      const prompt = `Based on the following work output, provide a detailed summary focusing on these aspects: ${aspects.join(', ')}

## Work Output
Task: ${fullOutput.fullResult?.task || 'Unknown task'}
Summary: ${fullOutput.summary}
Duration: ${fullOutput.duration}ms
Files Created: ${fullOutput.fullResult?.filesCreated?.join(', ') || 'None'}
Files Modified: ${fullOutput.fullResult?.filesModified?.join(', ') || 'None'}

## Detailed Result
${JSON.stringify(fullOutput.fullResult?.finalToolResult || fullOutput.fullResult?.content || {}, null, 2).slice(0, 5000)}

Provide a comprehensive response covering the requested aspects: ${aspects.join(', ')}`;

      const response = await callKimi(this.apiKey, [
        { role: 'system', content: 'You are a technical writer creating detailed summaries of completed work. Be specific, factual, and focus on the requested aspects.' },
        { role: 'user', content: prompt }
      ]);
      
      return {
        agentId: agent_id,
        aspects,
        extendedSummary: response.content,
        originalSummary: fullOutput.summary,
        success: true
      };
      
    } catch (error) {
      console.error(`[Orchestrator] Failed to get extended summary for ${agent_id}:`, error.message);
      return {
        agentId: agent_id,
        error: error.message,
        success: false
      };
    }
  }
  
  /**
   * Emit a progress event
   * 
   * Emits events both through the EventEmitter and the onProgress callback.
   * 
   * @param {string} type - Event type (will be prefixed with 'orchestrator:')
   * @param {Object} [data={}] - Additional event data
   * @private
   */
  emitProgress(type, data = {}) {
    const event = {
      type: `orchestrator:${type}`,
      taskId: this.taskId,
      iteration: this.iterations,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    // Emit through EventEmitter
    this.emit('progress', event);
    
    // Call progress callback if provided
    if (this.onProgress) {
      this.onProgress(event);
    }
  }
  
  /**
   * Get current orchestrator state
   * 
   * Returns a snapshot of the orchestrator's current state for monitoring.
   * 
   * @returns {OrchestratorState} Current state object
   * 
   * @typedef {Object} OrchestratorState
   * @property {string} taskId - Current task ID
   * @property {string} status - Current status ('idle', 'running', 'completed', 'error', 'cancelled')
   * @property {number} iterations - Number of iterations executed
   * @property {Array<string>} completedAgents - IDs of completed agents
   * @property {Object} registeredAgents - Summary from agent registry
   */
  getState() {
    return {
      taskId: this.taskId,
      status: this.status,
      iterations: this.iterations,
      completedAgents: this.completedAgents,
      registeredAgents: agentRegistry.getTaskSummary(this.taskId)
    };
  }
}

/**
 * Run the orchestrator - main entry point for external callers
 * 
 * This is a convenience function that creates an Orchestrator instance
 * and runs it with the provided configuration.
 * 
 * @param {string} taskId - Unique task identifier
 * @param {string} task - User's task description
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Kimi API key
 * @param {string} options.projectName - Name of the project to work in
 * @param {Function} options.emit - Event emitter function for progress events
 * @param {AbortSignal} [options.abortSignal] - Cancellation signal
 * @param {Function} [options.onUserInteraction] - User interaction handler
 * @returns {Promise<OrchestratorResult>} Result of the orchestration
 * 
 * @example
 * const result = await runOrchestrator('task-123', 'Build a REST API', {
 *   apiKey: process.env.KIMI_API_KEY,
 *   projectName: 'my-api-project',
 *   emit: (event) => console.log(event),
 *   abortSignal: controller.signal,
 *   onUserInteraction: async (request) => {
 *     return await promptUser(request.message);
 *   }
 * });
 */
export async function runOrchestrator(taskId, task, options) {
  const orchestrator = new Orchestrator({
    taskId,
    apiKey: options.apiKey,
    projectName: options.projectName,
    onProgress: options.emit,
    abortSignal: options.abortSignal,
    onUserInteraction: options.onUserInteraction
  });
  
  return await orchestrator.run(task);
}

export default Orchestrator;
