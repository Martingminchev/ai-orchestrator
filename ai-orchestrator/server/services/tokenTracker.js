/**
 * Token usage tracking for the AI orchestrator
 * Tracks token consumption across orchestrator and worker agents
 */

// Context window limits for different models
const CONTEXT_LIMITS = {
  'kimi-k2.5': 131072,  // 128K context
  'moonshot-v1-128k': 131072,
  'moonshot-v1-32k': 32768,
  'moonshot-v1-8k': 8192,
  'default': 131072,
};

class TokenTracker {
  constructor() {
    this.reset();
    this.contextLimit = CONTEXT_LIMITS['default'];
    this.eventListeners = new Set();
  }

  /**
   * Set the context limit for the current model
   * @param {string} model - Model name
   */
  setModel(model) {
    this.contextLimit = CONTEXT_LIMITS[model] || CONTEXT_LIMITS['default'];
  }

  /**
   * Register an event listener for token updates
   * @param {Function} callback - Callback function (stats) => void
   */
  onUpdate(callback) {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Emit update event to all listeners
   */
  emitUpdate() {
    const stats = this.getStats();
    for (const callback of this.eventListeners) {
      try {
        callback(stats);
      } catch (e) {
        console.error('[TokenTracker] Error in event listener:', e);
      }
    }
  }

  /**
   * Reset all tracking stats
   */
  reset() {
    this.orchestrator = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      calls: 0,
    };
    
    this.agents = new Map(); // agentId -> { role, prompt_tokens, completion_tokens, total_tokens, calls }
    
    this.accumulated = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      calls: 0,
    };
    
    // Track per-call history for detailed analysis
    this.callHistory = [];
  }

  /**
   * Add token usage for an agent
   * Supports two call patterns:
   * 1. addUsage(agentId, role, usage) - three arguments
   * 2. addUsage({ source, agentId, promptTokens, completionTokens, totalTokens }) - object argument
   * 
   * @param {string|Object} agentIdOrObj - Agent ID or usage object
   * @param {string} [role] - Role of the agent
   * @param {Object} [usage] - Token usage object
   */
  addUsage(agentIdOrObj, role, usage) {
    // Handle object argument pattern
    let agentId, prompt_tokens, completion_tokens, total_tokens;
    
    if (typeof agentIdOrObj === 'object') {
      const obj = agentIdOrObj;
      agentId = obj.agentId || obj.source || 'unknown';
      role = obj.source?.includes('orchestrator') ? 'orchestrator' : (obj.role || 'agent');
      prompt_tokens = obj.promptTokens || obj.prompt_tokens || 0;
      completion_tokens = obj.completionTokens || obj.completion_tokens || 0;
      total_tokens = obj.totalTokens || obj.total_tokens || 0;
    } else {
      agentId = agentIdOrObj;
      const u = usage || {};
      prompt_tokens = u.prompt_tokens || 0;
      completion_tokens = u.completion_tokens || 0;
      total_tokens = u.total_tokens || 0;
    }
    
    // Update accumulated totals
    this.accumulated.prompt_tokens += prompt_tokens;
    this.accumulated.completion_tokens += completion_tokens;
    this.accumulated.total_tokens += total_tokens;
    this.accumulated.calls += 1;
    
    // Update orchestrator stats if this is the orchestrator
    if (role === 'orchestrator') {
      this.orchestrator.prompt_tokens += prompt_tokens;
      this.orchestrator.completion_tokens += completion_tokens;
      this.orchestrator.total_tokens += total_tokens;
      this.orchestrator.calls += 1;
      this.orchestrator.lastUpdated = new Date().toISOString();
      
      // Record in call history
      this.callHistory.push({
        timestamp: new Date().toISOString(),
        source: 'orchestrator',
        role: 'orchestrator',
        prompt_tokens,
        completion_tokens,
        total_tokens,
      });
      
      // Emit update event
      this.emitUpdate();
      return;
    }
    
    // Update or create agent stats
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        id: agentId,
        role,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        calls: 0,
      });
    }
    
    const agentStats = this.agents.get(agentId);
    agentStats.prompt_tokens += prompt_tokens;
    agentStats.completion_tokens += completion_tokens;
    agentStats.total_tokens += total_tokens;
    agentStats.calls += 1;
    agentStats.lastUpdated = new Date().toISOString();
    
    // Record in call history
    this.callHistory.push({
      timestamp: new Date().toISOString(),
      source: agentId,
      role,
      prompt_tokens,
      completion_tokens,
      total_tokens,
    });
    
    // Emit update event
    this.emitUpdate();
  }

  /**
   * Get current token usage statistics
   * @returns {Object} Stats object with orchestrator, agents, and accumulated data
   */
  getStats() {
    const contextPercentage = this.contextLimit > 0 
      ? ((this.accumulated.total_tokens / this.contextLimit) * 100).toFixed(2)
      : 0;
    
    return {
      orchestrator: { ...this.orchestrator },
      agents: Array.from(this.agents.values()).map(agent => ({ ...agent })),
      accumulated: { ...this.accumulated },
      agentCount: this.agents.size,
      contextLimit: this.contextLimit,
      contextPercentage: parseFloat(contextPercentage),
      contextWarning: parseFloat(contextPercentage) > 80,
      callHistory: this.callHistory.slice(-20), // Last 20 calls
    };
  }

  /**
   * Get stats for a specific agent
   * @param {string} agentId - Agent identifier
   * @returns {Object|null} Agent stats or null if not found
   */
  getAgentStats(agentId) {
    const agent = this.agents.get(agentId);
    return agent ? { ...agent } : null;
  }

  /**
   * Calculate estimated cost based on token usage
   * Moonshot pricing (approximate):
   * - moonshot-v1-8k: ¥0.012/1K tokens
   * - moonshot-v1-32k: ¥0.024/1K tokens
   * - moonshot-v1-128k: ¥0.06/1K tokens
   * @param {string} model - Model name
   * @returns {Object} Cost breakdown in CNY
   */
  estimateCost(model = 'moonshot-v1-128k') {
    const pricing = {
      'moonshot-v1-8k': { input: 0.012, output: 0.012 },
      'moonshot-v1-32k': { input: 0.024, output: 0.024 },
      'moonshot-v1-128k': { input: 0.06, output: 0.06 },
    };
    
    const rates = pricing[model] || pricing['moonshot-v1-128k'];
    
    const inputCost = (this.accumulated.prompt_tokens / 1000) * rates.input;
    const outputCost = (this.accumulated.completion_tokens / 1000) * rates.output;
    
    return {
      inputCost: inputCost.toFixed(4),
      outputCost: outputCost.toFixed(4),
      totalCost: (inputCost + outputCost).toFixed(4),
      currency: 'CNY',
      model,
    };
  }

  /**
   * Get a summary string of token usage
   * @returns {string} Human-readable summary
   */
  getSummary() {
    const { accumulated, orchestrator } = this;
    const agentTokens = accumulated.total_tokens - orchestrator.total_tokens;
    
    return [
      `Total tokens: ${accumulated.total_tokens.toLocaleString()}`,
      `  - Orchestrator: ${orchestrator.total_tokens.toLocaleString()} (${orchestrator.calls} calls)`,
      `  - Agents: ${agentTokens.toLocaleString()} (${this.agents.size} agents)`,
      `Breakdown: ${accumulated.prompt_tokens.toLocaleString()} input, ${accumulated.completion_tokens.toLocaleString()} output`,
    ].join('\n');
  }
}

// Export singleton instance
export const tokenTracker = new TokenTracker();

// Also export the class for testing
export { TokenTracker };
