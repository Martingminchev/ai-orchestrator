/**
 * SubAgent - Specialized worker agent for the orchestration system
 * 
 * Each sub-agent has a specific role and task, and uses Kimi K2.5 to
 * complete its assigned work.
 */

import { EventEmitter } from 'events';
import { SUBAGENT_SYSTEM_PROMPTS } from './prompts.js';

/**
 * Kimi API configuration
 */
const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions';
const KIMI_MODEL = 'kimi-k2.5';

/**
 * SubAgent class - A specialized worker agent
 * 
 * @extends EventEmitter
 */
export class SubAgent extends EventEmitter {
  /**
   * Create a new SubAgent
   * 
   * @param {Object} config - Agent configuration
   * @param {string} config.id - Unique identifier for this agent
   * @param {string} config.role - Agent role (explorer, reviewer, analyst, writer, coder)
   * @param {string} config.task - The specific task assigned to this agent
   * @param {string} config.context - Additional context for the task
   * @param {string} config.apiKey - Kimi API key
   * @param {Object} config.tokenTracker - Token usage tracker
   * @param {string} config.taskId - Parent task ID for event correlation
   */
  constructor({ id, role, task, context, apiKey, tokenTracker, taskId }) {
    super();
    
    this.id = id;
    this.role = role;
    this.task = task;
    this.context = context || '';
    this.apiKey = apiKey;
    this.tokenTracker = tokenTracker;
    this.taskId = taskId;
    
    // Validate role
    if (!SUBAGENT_SYSTEM_PROMPTS[role]) {
      throw new Error(`Unknown agent role: ${role}. Valid roles: ${Object.keys(SUBAGENT_SYSTEM_PROMPTS).join(', ')}`);
    }
    
    this.systemPrompt = SUBAGENT_SYSTEM_PROMPTS[role];
  }

  /**
   * Emit a progress event
   * 
   * @param {string} type - Event type
   * @param {Object} data - Additional event data
   */
  emitProgress(type, data = {}) {
    this.emit('progress', {
      type,
      taskId: this.taskId,
      agentId: this.id,
      role: this.role,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  /**
   * Build the user message for the Kimi API
   * 
   * @returns {string} Formatted user message
   */
  buildUserMessage() {
    let message = `## Your Task\n${this.task}`;
    
    if (this.context) {
      message += `\n\n## Context\n${this.context}`;
    }
    
    message += `\n\n## Instructions\nComplete this task thoroughly and report your findings. Be specific and actionable.`;
    
    return message;
  }

  /**
   * Call the Kimi API
   * 
   * @returns {Promise<Object>} API response with content and usage
   */
  async callKimiAPI() {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: this.buildUserMessage() }
    ];

    const response = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kimi API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  /**
   * Run the agent's task
   * 
   * @returns {Promise<Object>} Result object with id, role, result, and tokensUsed
   */
  async run() {
    const startTime = Date.now();
    
    try {
      // Emit started event
      this.emitProgress('agent_started', {
        task: this.task
      });

      // Emit working event
      this.emitProgress('agent_working', {
        message: `${this.role} agent is processing...`
      });

      // Call Kimi API
      const { content, usage } = await this.callKimiAPI();
      
      const duration = Date.now() - startTime;

      // Track token usage
      if (this.tokenTracker) {
        this.tokenTracker.addUsage({
          source: `subagent-${this.role}`,
          agentId: this.id,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens
        });
      }

      // Emit completed event
      this.emitProgress('agent_completed', {
        task: this.task,
        duration,
        tokensUsed: usage.total_tokens,
        resultPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
      });

      return {
        id: this.id,
        role: this.role,
        task: this.task,
        result: content,
        tokensUsed: usage.total_tokens,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Emit error event
      this.emitProgress('agent_error', {
        task: this.task,
        error: error.message,
        duration
      });

      // Return error result instead of throwing
      return {
        id: this.id,
        role: this.role,
        task: this.task,
        result: `Error: ${error.message}`,
        error: true,
        errorMessage: error.message,
        tokensUsed: 0,
        duration
      };
    }
  }
}

/**
 * Factory function to create multiple sub-agents
 * 
 * @param {Array<Object>} agentSpecs - Array of agent specifications
 * @param {string} apiKey - Kimi API key
 * @param {Object} tokenTracker - Token usage tracker
 * @param {string} taskId - Parent task ID
 * @returns {Array<SubAgent>} Array of SubAgent instances
 */
export function createSubAgents(agentSpecs, apiKey, tokenTracker, taskId) {
  return agentSpecs.map(spec => new SubAgent({
    id: spec.id,
    role: spec.role,
    task: spec.task,
    context: spec.context,
    apiKey,
    tokenTracker,
    taskId
  }));
}

/**
 * Run multiple agents in parallel
 * 
 * @param {Array<SubAgent>} agents - Array of SubAgent instances
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<Array<Object>>} Array of agent results
 */
export async function runAgentsInParallel(agents, onProgress) {
  // Set up progress listeners
  agents.forEach(agent => {
    if (onProgress) {
      agent.on('progress', onProgress);
    }
  });

  // Run all agents in parallel
  const results = await Promise.all(agents.map(agent => agent.run()));

  // Clean up listeners
  agents.forEach(agent => {
    agent.removeAllListeners();
  });

  return results;
}

export default SubAgent;
