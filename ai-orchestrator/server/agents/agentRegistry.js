import { EventEmitter } from 'events';

/**
 * @fileoverview Agent Registry Service
 * 
 * This service tracks all agents, their lifecycle, and enables querying completed agents.
 * It provides centralized management for agent lifecycle states, task associations,
 * and memory management through archiving.
 * 
 * @module server/agents/agentRegistry
 */

/**
 * Agent lifecycle states:
 * - spawned: Agent created but not started
 * - running: Agent is executing
 * - completed: Agent finished successfully
 * - verified: Agent's work has been verified
 * - archived: Agent removed from memory, outputs saved to disk
 * - error: Agent failed with error
 * - cancelled: Agent was cancelled
 * 
 * @typedef {'spawned' | 'running' | 'completed' | 'verified' | 'archived' | 'error' | 'cancelled'} AgentStatus
 */

/**
 * @typedef {Object} AgentRecord
 * @property {string} id - Unique agent identifier
 * @property {string} role - Agent role (e.g., 'coder', 'reviewer')
 * @property {string} expertise - Agent expertise/specialization
 * @property {string|null} taskId - Associated task ID
 * @property {string|null} parentAgentId - Parent agent ID (for sub-agents)
 * @property {AgentStatus} status - Current lifecycle status
 * @property {boolean} canQuery - Whether agent can be queried
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string|null} startedAt - ISO timestamp of start
 * @property {string|null} completedAt - ISO timestamp of completion
 * @property {string|null} outputPath - Path where output was saved (when archived)
 * @property {Object|null} result - Result stored when completed
 * @property {Error|null} error - Error if agent failed
 * @property {BaseAgent|null} agent - Reference to actual agent instance (null when archived)
 */

/**
 * @typedef {Object} RegisterOptions
 * @property {string} [taskId] - Associated task ID
 * @property {string} [parentAgentId] - Parent agent (for sub-agents)
 * @property {string} [expertise] - Agent expertise/specialization
 */

/**
 * @typedef {Object} TaskSummary
 * @property {string} taskId - The task ID
 * @property {number} totalAgents - Total number of agents for the task
 * @property {Object<string, number>} byStatus - Count of agents by status
 * @property {Object<string, number>} byRole - Count of agents by role
 * @property {Array<Object>} agents - Summary info for each agent
 */

/**
 * @typedef {Object} RegistryStats
 * @property {number} totalAgents - Total agents ever registered
 * @property {number} activeAgents - Currently active agents
 * @property {number} completedAgents - Successfully completed agents
 * @property {number} archivedAgents - Archived agents
 * @property {number} errorAgents - Agents that failed
 * @property {number} totalTasks - Total tasks with agents
 * @property {Object<string, number>} byStatus - Count by status
 * @property {Object<string, number>} byRole - Count by role
 */

/**
 * Agent Registry - Centralized management for agent lifecycle and querying
 * 
 * @extends EventEmitter
 * @fires AgentRegistry#agentRegistered - When a new agent is registered
 * @fires AgentRegistry#agentStarted - When an agent starts executing
 * @fires AgentRegistry#agentCompleted - When an agent completes successfully
 * @fires AgentRegistry#agentError - When an agent fails with error
 * @fires AgentRegistry#agentVerified - When an agent's work is verified
 * @fires AgentRegistry#agentArchived - When an agent is archived
 * @fires AgentRegistry#agentProgress - When an agent reports progress
 * @fires AgentRegistry#taskCleanedUp - When a task's agents are cleaned up
 * 
 * @example
 * import { agentRegistry } from './agentRegistry.js';
 * 
 * // Register an agent
 * const record = agentRegistry.register(myAgent, { taskId: 'task-123' });
 * 
 * // Listen to events
 * agentRegistry.on('agentCompleted', ({ agentId, record }) => {
 *   console.log(`Agent ${agentId} completed`);
 * });
 * 
 * // Query completed agent
 * const answer = await agentRegistry.queryAgent(agentId, 'What did you find?');
 */
export class AgentRegistry extends EventEmitter {
  /**
   * Creates a new AgentRegistry instance
   */
  constructor() {
    super();
    
    /** 
     * Map of agent ID to AgentRecord
     * @type {Map<string, AgentRecord>}
     * @private
     */
    this.agents = new Map();
    
    /** 
     * Map of task ID to Set of agent IDs
     * @type {Map<string, Set<string>>}
     * @private
     */
    this.taskAgents = new Map();
  }

  /**
   * Register a new agent with the registry
   * 
   * @param {BaseAgent} agent - The agent instance to register
   * @param {RegisterOptions} [options={}] - Registration options
   * @returns {AgentRecord} The created agent record
   * @throws {Error} If agent with same ID is already registered
   * 
   * @example
   * const record = registry.register(agent, {
   *   taskId: 'task-123',
   *   parentAgentId: 'parent-agent-456',
   *   expertise: 'TypeScript refactoring'
   * });
   */
  register(agent, options = {}) {
    // Check for duplicate registration
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already registered: ${agent.id}`);
    }

    const record = {
      id: agent.id,
      role: agent.role,
      expertise: options.expertise || agent.role,
      taskId: options.taskId || null,
      parentAgentId: options.parentAgentId || null,
      status: 'spawned',
      canQuery: false,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      outputPath: null,
      result: null,
      error: null,
      agent: agent
    };

    this.agents.set(agent.id, record);

    // Track by task
    if (options.taskId) {
      if (!this.taskAgents.has(options.taskId)) {
        this.taskAgents.set(options.taskId, new Set());
      }
      this.taskAgents.get(options.taskId).add(agent.id);
    }

    // Listen to agent events
    agent.on('progress', (event) => {
      this.handleAgentProgress(agent.id, event);
    });

    /**
     * Agent registered event
     * @event AgentRegistry#agentRegistered
     * @type {Object}
     * @property {string} agentId - The registered agent's ID
     * @property {AgentRecord} record - The agent record
     */
    this.emit('agentRegistered', { agentId: agent.id, record });
    
    return record;
  }

  /**
   * Handle agent progress events and update status accordingly
   * 
   * @param {string} agentId - The agent's ID
   * @param {Object} event - The progress event
   * @private
   */
  handleAgentProgress(agentId, event) {
    const record = this.agents.get(agentId);
    if (!record) return;

    switch (event.type) {
      case 'calling_llm':
        if (record.status === 'spawned') {
          record.status = 'running';
          record.startedAt = new Date().toISOString();
          /**
           * Agent started event
           * @event AgentRegistry#agentStarted
           * @type {Object}
           * @property {string} agentId - The agent's ID
           * @property {AgentRecord} record - The agent record
           */
          this.emit('agentStarted', { agentId, record });
        }
        break;

      case 'completed':
        record.status = 'completed';
        record.completedAt = new Date().toISOString();
        record.canQuery = true;
        record.result = event;
        /**
         * Agent completed event
         * @event AgentRegistry#agentCompleted
         * @type {Object}
         * @property {string} agentId - The agent's ID
         * @property {AgentRecord} record - The agent record
         */
        this.emit('agentCompleted', { agentId, record });
        break;

      case 'error':
        record.status = 'error';
        record.error = event.error;
        record.completedAt = new Date().toISOString();
        /**
         * Agent error event
         * @event AgentRegistry#agentError
         * @type {Object}
         * @property {string} agentId - The agent's ID
         * @property {AgentRecord} record - The agent record
         * @property {Error} error - The error that occurred
         */
        this.emit('agentError', { agentId, record, error: event.error });
        break;
    }

    /**
     * Agent progress event - forwarded from agent
     * @event AgentRegistry#agentProgress
     * @type {Object}
     * @property {string} agentId - The agent's ID
     * @property {Object} event - The progress event from the agent
     */
    this.emit('agentProgress', { agentId, event });
  }

  /**
   * Update an agent's status and optional additional data
   * 
   * @param {string} agentId - The agent's ID
   * @param {AgentStatus} status - The new status
   * @param {Object} [data={}] - Additional data to merge into the record
   * @returns {AgentRecord} The updated agent record
   * @throws {Error} If agent is not found
   * 
   * @example
   * registry.updateStatus('agent-123', 'verified', { verifiedBy: 'user-456' });
   */
  updateStatus(agentId, status, data = {}) {
    const record = this.agents.get(agentId);
    if (!record) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    record.status = status;
    Object.assign(record, data);

    if (status === 'verified') {
      /**
       * Agent verified event
       * @event AgentRegistry#agentVerified
       * @type {Object}
       * @property {string} agentId - The agent's ID
       * @property {AgentRecord} record - The agent record
       */
      this.emit('agentVerified', { agentId, record });
    }

    if (status === 'cancelled') {
      record.completedAt = record.completedAt || new Date().toISOString();
      this.emit('agentCancelled', { agentId, record });
    }

    return record;
  }

  /**
   * Get an agent record by ID
   * 
   * @param {string} agentId - The agent's ID
   * @returns {AgentRecord|undefined} The agent record or undefined if not found
   */
  get(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Check if an agent exists in the registry
   * 
   * @param {string} agentId - The agent's ID
   * @returns {boolean} True if agent exists
   */
  has(agentId) {
    return this.agents.has(agentId);
  }

  /**
   * Get all agents for a specific task
   * 
   * @param {string} taskId - The task ID
   * @returns {AgentRecord[]} Array of agent records for the task
   */
  getTaskAgents(taskId) {
    const agentIds = this.taskAgents.get(taskId);
    if (!agentIds) return [];

    return Array.from(agentIds)
      .map(id => this.agents.get(id))
      .filter(Boolean);
  }

  /**
   * Get all queryable agents (completed and not archived)
   * 
   * @param {string|null} [taskId=null] - Optional task ID to filter by
   * @returns {AgentRecord[]} Array of queryable agent records
   */
  getQueryableAgents(taskId = null) {
    const agents = taskId 
      ? this.getTaskAgents(taskId) 
      : Array.from(this.agents.values());
    
    return agents.filter(r => r.canQuery && r.agent !== null);
  }

  /**
   * Get agents filtered by status
   * 
   * @param {AgentStatus} status - The status to filter by
   * @param {string|null} [taskId=null] - Optional task ID to filter by
   * @returns {AgentRecord[]} Array of agent records with the specified status
   */
  getAgentsByStatus(status, taskId = null) {
    const agents = taskId 
      ? this.getTaskAgents(taskId) 
      : Array.from(this.agents.values());
    
    return agents.filter(r => r.status === status);
  }

  /**
   * Get agents by role
   * 
   * @param {string} role - The role to filter by
   * @param {string|null} [taskId=null] - Optional task ID to filter by
   * @returns {AgentRecord[]} Array of agent records with the specified role
   */
  getAgentsByRole(role, taskId = null) {
    const agents = taskId 
      ? this.getTaskAgents(taskId) 
      : Array.from(this.agents.values());
    
    return agents.filter(r => r.role === role);
  }

  /**
   * Query a completed agent with a question
   * 
   * @param {string} agentId - The agent's ID
   * @param {string} question - The question to ask the agent
   * @returns {Promise<Object>} The agent's response
   * @throws {Error} If agent is not found, not queryable, or archived
   * 
   * @example
   * const response = await registry.queryAgent('agent-123', 'What files did you modify?');
   */
  async queryAgent(agentId, question) {
    const record = this.agents.get(agentId);
    
    if (!record) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (!record.canQuery) {
      throw new Error(`Agent ${agentId} is not queryable (status: ${record.status})`);
    }
    if (!record.agent) {
      throw new Error(`Agent ${agentId} has been archived. Output path: ${record.outputPath || 'unknown'}`);
    }

    return await record.agent.query(question);
  }

  /**
   * Archive an agent - remove from memory, mark as archived
   * Should be called after verification and task completion
   * 
   * @param {string} agentId - The agent's ID
   * @param {string|null} [outputPath=null] - Path where agent output was saved
   * @returns {AgentRecord} The updated agent record
   * @throws {Error} If agent is not found
   * 
   * @example
   * registry.archive('agent-123', '/outputs/task-456/agent-123.json');
   */
  archive(agentId, outputPath = null) {
    const record = this.agents.get(agentId);
    if (!record) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Remove event listeners before nullifying
    if (record.agent) {
      record.agent.removeAllListeners('progress');
    }

    record.status = 'archived';
    record.canQuery = false;
    record.outputPath = outputPath;
    record.agent = null; // Release agent instance for GC

    /**
     * Agent archived event
     * @event AgentRegistry#agentArchived
     * @type {Object}
     * @property {string} agentId - The agent's ID
     * @property {string|null} outputPath - Path where output was saved
     */
    this.emit('agentArchived', { agentId, outputPath });
    
    return record;
  }

  /**
   * Archive all completed/verified agents for a task
   * 
   * @param {string} taskId - The task ID
   * @param {string|null} [outputBasePath=null] - Base path for output files
   * @returns {string[]} Array of archived agent IDs
   */
  archiveTaskAgents(taskId, outputBasePath = null) {
    const agents = this.getTaskAgents(taskId);
    const archived = [];

    for (const record of agents) {
      if (record.status === 'completed' || record.status === 'verified') {
        const outputPath = outputBasePath 
          ? `${outputBasePath}/${record.id}` 
          : null;
        this.archive(record.id, outputPath);
        archived.push(record.id);
      }
    }

    return archived;
  }

  /**
   * Get a summary of all agents for a task
   * 
   * @param {string} taskId - The task ID
   * @returns {TaskSummary} Summary of agents for the task
   */
  getTaskSummary(taskId) {
    const agents = this.getTaskAgents(taskId);

    const summary = {
      taskId,
      totalAgents: agents.length,
      byStatus: {},
      byRole: {},
      agents: agents.map(r => ({
        id: r.id,
        role: r.role,
        expertise: r.expertise,
        status: r.status,
        canQuery: r.canQuery,
        parentAgentId: r.parentAgentId,
        duration: r.completedAt && r.startedAt
          ? new Date(r.completedAt) - new Date(r.startedAt)
          : null,
        hasError: r.error !== null
      }))
    };

    // Count by status and role
    for (const record of agents) {
      summary.byStatus[record.status] = (summary.byStatus[record.status] || 0) + 1;
      summary.byRole[record.role] = (summary.byRole[record.role] || 0) + 1;
    }

    return summary;
  }

  /**
   * Clean up a task - archive all agents, remove task tracking
   * 
   * @param {string} taskId - The task ID to clean up
   * @returns {{ cleaned: number }} Number of agents cleaned up
   */
  cleanupTask(taskId) {
    const agentIds = this.taskAgents.get(taskId);
    if (!agentIds) return { cleaned: 0 };

    let cleaned = 0;
    for (const agentId of agentIds) {
      const record = this.agents.get(agentId);
      if (record && record.status !== 'archived') {
        // Remove event listeners
        if (record.agent) {
          record.agent.removeAllListeners('progress');
        }
        record.agent = null;
        record.status = 'archived';
        cleaned++;
      }
    }

    this.taskAgents.delete(taskId);
    
    /**
     * Task cleaned up event
     * @event AgentRegistry#taskCleanedUp
     * @type {Object}
     * @property {string} taskId - The task ID
     * @property {number} agentsCleaned - Number of agents cleaned up
     */
    this.emit('taskCleanedUp', { taskId, agentsCleaned: cleaned });

    return { cleaned };
  }

  /**
   * Get all active agents (spawned or running)
   * 
   * @returns {AgentRecord[]} Array of active agent records
   */
  getActiveAgents() {
    return Array.from(this.agents.values()).filter(
      r => r.status === 'spawned' || r.status === 'running'
    );
  }

  /**
   * Check if a task has any running agents
   * 
   * @param {string} taskId - The task ID
   * @returns {boolean} True if task has running agents
   */
  hasRunningAgents(taskId) {
    const agents = this.getTaskAgents(taskId);
    return agents.some(r => r.status === 'running');
  }

  /**
   * Check if a task has any active agents (spawned or running)
   * 
   * @param {string} taskId - The task ID
   * @returns {boolean} True if task has active agents
   */
  hasActiveAgents(taskId) {
    const agents = this.getTaskAgents(taskId);
    return agents.some(r => r.status === 'spawned' || r.status === 'running');
  }

  // ============================================================
  // Debugging and Introspection Methods
  // ============================================================

  /**
   * Get all agents in the registry
   * 
   * @returns {AgentRecord[]} Array of all agent records
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get all task IDs that have agents
   * 
   * @returns {string[]} Array of task IDs
   */
  getAllTaskIds() {
    return Array.from(this.taskAgents.keys());
  }

  /**
   * Get comprehensive statistics about the registry
   * 
   * @returns {RegistryStats} Registry statistics
   */
  getStats() {
    const agents = Array.from(this.agents.values());
    
    const stats = {
      totalAgents: agents.length,
      activeAgents: 0,
      completedAgents: 0,
      archivedAgents: 0,
      errorAgents: 0,
      cancelledAgents: 0,
      totalTasks: this.taskAgents.size,
      byStatus: {},
      byRole: {},
      memoryUsage: {
        agentsInMemory: agents.filter(r => r.agent !== null).length,
        agentsArchived: agents.filter(r => r.agent === null).length
      }
    };

    for (const record of agents) {
      // Count by status
      stats.byStatus[record.status] = (stats.byStatus[record.status] || 0) + 1;
      
      // Count by role
      stats.byRole[record.role] = (stats.byRole[record.role] || 0) + 1;
      
      // Update specific counters
      if (record.status === 'spawned' || record.status === 'running') {
        stats.activeAgents++;
      } else if (record.status === 'completed' || record.status === 'verified') {
        stats.completedAgents++;
      } else if (record.status === 'archived') {
        stats.archivedAgents++;
      } else if (record.status === 'error') {
        stats.errorAgents++;
      } else if (record.status === 'cancelled') {
        stats.cancelledAgents++;
      }
    }

    return stats;
  }

  /**
   * Get a detailed debug dump of an agent
   * 
   * @param {string} agentId - The agent's ID
   * @returns {Object|null} Detailed agent info or null if not found
   */
  debugAgent(agentId) {
    const record = this.agents.get(agentId);
    if (!record) return null;

    return {
      ...record,
      hasAgentInstance: record.agent !== null,
      agentType: record.agent?.constructor?.name || 'N/A',
      resultType: record.result ? typeof record.result : null,
      errorMessage: record.error?.message || null,
      duration: record.completedAt && record.startedAt
        ? `${new Date(record.completedAt) - new Date(r.startedAt)}ms`
        : 'N/A'
    };
  }

  /**
   * List all agents with basic info (for debugging)
   * 
   * @param {Object} [options={}] - Filter options
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.role] - Filter by role
   * @param {string} [options.taskId] - Filter by task
   * @returns {Array<Object>} Array of agent summaries
   */
  listAgents(options = {}) {
    let agents = Array.from(this.agents.values());

    if (options.status) {
      agents = agents.filter(r => r.status === options.status);
    }
    if (options.role) {
      agents = agents.filter(r => r.role === options.role);
    }
    if (options.taskId) {
      agents = agents.filter(r => r.taskId === options.taskId);
    }

    return agents.map(r => ({
      id: r.id,
      role: r.role,
      expertise: r.expertise,
      status: r.status,
      taskId: r.taskId,
      canQuery: r.canQuery,
      inMemory: r.agent !== null,
      createdAt: r.createdAt
    }));
  }

  /**
   * Get agent hierarchy for a task (parent-child relationships)
   * 
   * @param {string} taskId - The task ID
   * @returns {Object} Tree structure of agents
   */
  getAgentHierarchy(taskId) {
    const agents = this.getTaskAgents(taskId);
    const agentMap = new Map(agents.map(a => [a.id, a]));
    
    // Find root agents (no parent)
    const roots = agents.filter(a => !a.parentAgentId);
    
    const buildTree = (agent) => ({
      id: agent.id,
      role: agent.role,
      status: agent.status,
      children: agents
        .filter(a => a.parentAgentId === agent.id)
        .map(buildTree)
    });

    return {
      taskId,
      hierarchy: roots.map(buildTree)
    };
  }

  /**
   * Clear all data from the registry (useful for testing)
   * Emits warning event before clearing
   */
  clear() {
    this.emit('warning', { message: 'Registry is being cleared' });
    
    // Clean up all agent listeners
    for (const record of this.agents.values()) {
      if (record.agent) {
        record.agent.removeAllListeners('progress');
      }
    }
    
    this.agents.clear();
    this.taskAgents.clear();
    
    this.emit('cleared', { timestamp: new Date().toISOString() });
  }

  /**
   * Export registry state for persistence or debugging
   * 
   * @returns {Object} Serializable registry state
   */
  exportState() {
    const agents = Array.from(this.agents.values()).map(r => ({
      ...r,
      agent: null, // Don't serialize agent instances
      hasAgentInstance: r.agent !== null
    }));

    const taskAgents = {};
    for (const [taskId, agentIds] of this.taskAgents) {
      taskAgents[taskId] = Array.from(agentIds);
    }

    return {
      exportedAt: new Date().toISOString(),
      agents,
      taskAgents,
      stats: this.getStats()
    };
  }
}

/**
 * Singleton instance of the AgentRegistry
 * @type {AgentRegistry}
 */
export const agentRegistry = new AgentRegistry();
