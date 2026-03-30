/**
 * Supervisor Agent
 * 
 * Reviews, consolidates, and summarizes work from multiple agents.
 * Identifies conflicts, redundancies, and gaps in agent outputs.
 * 
 * @module agents/supervisorAgent
 */

import { BaseAgent } from './baseAgent.js';
import { SUPERVISOR_TOOLS } from './tools/definitions.js';
import { fileManager } from '../services/fileManager.js';

/**
 * System prompt that defines the supervisor's behavior and responsibilities
 * @constant {string}
 */
const SUPERVISOR_SYSTEM_PROMPT = `You are a Supervisor Agent responsible for reviewing and consolidating work from multiple agents.

Your job is to:
1. Review the outputs and reports from each agent
2. Identify any conflicts, inconsistencies, or overlapping work
3. Assess the overall quality and completeness
4. Generate a consolidated summary that captures the key outcomes
5. Provide recommendations for any follow-up actions needed

Guidelines:
- Look at the actual files if needed to verify agent reports
- Check for conflicts (e.g., two agents modifying the same file differently)
- Identify redundant work that can be consolidated
- Highlight any gaps or incomplete work
- Keep the summary focused and actionable - not too long, not too short

The summary you generate will be sent to the Orchestrator, so:
- Don't include unnecessary details
- Focus on outcomes and deliverables
- Clearly state if there are any issues that need attention
- Include a list of files that were modified/created

When done, use the generate_summary tool with your consolidated report.`;

/**
 * Supervisor Agent that reviews and consolidates work from multiple agents.
 * 
 * Responsibilities:
 * - Review outputs from multiple agents
 * - Detect conflicts (e.g., same file modified differently)
 * - Identify redundant or overlapping work
 * - Generate consolidated summaries for the orchestrator
 * 
 * @class SupervisorAgent
 * @extends BaseAgent
 * 
 * @example
 * const supervisor = new SupervisorAgent({
 *   apiKey: 'sk-...',
 *   agentOutputs: [
 *     { agentId: 'agent-1', role: 'coder', result: '...', filesModified: ['src/app.js'] },
 *     { agentId: 'agent-2', role: 'coder', result: '...', filesModified: ['src/app.js'] }
 *   ],
 *   taskDescription: 'Implement user authentication'
 * });
 * 
 * const result = await supervisor.supervise();
 * console.log(result.conflicts); // Files modified by multiple agents
 */
export class SupervisorAgent extends BaseAgent {
  /**
   * Creates a new SupervisorAgent instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - API key for the LLM provider
   * @param {Array<AgentOutput>} [options.agentOutputs=[]] - Outputs from agents to review
   * @param {string} [options.taskDescription=''] - Original task description for context
   * @param {string} [options.model] - Model to use (inherited from BaseAgent)
   * @param {number} [options.maxIterations] - Max iterations (inherited from BaseAgent)
   * 
   * @typedef {Object} AgentOutput
   * @property {string} agentId - Unique identifier of the agent
   * @property {string} role - Role of the agent (e.g., 'coder', 'reviewer')
   * @property {string} [expertise] - Agent's area of expertise
   * @property {string|Object} result - The agent's output/result
   * @property {string[]} [filesModified] - List of files the agent modified
   * @property {string[]} [filesCreated] - List of files the agent created
   */
  constructor(options) {
    const {
      agentOutputs = [],
      taskDescription = '',
      ...baseOptions
    } = options;
    
    /**
     * Tool executors for supervisor-specific tools
     * @type {Object.<string, Function>}
     */
    const toolExecutors = {
      /**
       * Read file contents for verification
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Path to the file to read
       * @param {string} [args.encoding='utf-8'] - File encoding
       * @returns {Promise<Object>} File contents and metadata
       */
      read_file: async (args) => {
        const result = await fileManager.readFile(args.path, {
          encoding: args.encoding
        });
        return result;
      },
      
      /**
       * Search codebase for patterns
       * @param {Object} args - Tool arguments
       * @param {string} args.pattern - Search pattern (regex supported)
       * @param {string} [args.path] - Base path to search from
       * @param {string} [args.file_pattern] - File glob pattern to filter
       * @returns {Promise<Object>} Search results with matches
       */
      search_codebase: async (args) => {
        const result = await fileManager.searchFiles(args.pattern, {
          basePath: args.path,
          filePattern: args.file_pattern,
          maxResults: 50
        });
        return result;
      },
      
      /**
       * List directory contents
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Directory path to list
       * @param {boolean} [args.recursive=false] - Whether to list recursively
       * @param {number} [args.max_depth] - Maximum depth for recursive listing
       * @returns {Promise<Object>} Directory listing
       */
      list_directory: async (args) => {
        const result = await fileManager.listDirectory(args.path, {
          recursive: args.recursive,
          maxDepth: args.max_depth
        });
        return result;
      },
      
      /**
       * Generate consolidated summary - terminal tool that completes supervision
       * @param {Object} args - Tool arguments
       * @param {Array<Object>} args.agent_outputs - Summary of each agent's work
       * @param {string} args.consolidated_summary - Overall consolidated summary
       * @param {string[]} [args.recommendations] - Recommended follow-up actions
       * @param {Array<Object>} [args.conflicts] - Detected conflicts between agents
       * @param {string[]} [args.all_files_modified] - Complete list of modified files
       * @param {string[]} [args.all_files_created] - Complete list of created files
       * @returns {Object} Structured supervision result
       */
      generate_summary: async (args) => {
        // Terminal tool - this completes the supervision
        return {
          agentSummaries: args.agent_outputs,
          consolidatedSummary: args.consolidated_summary,
          recommendations: args.recommendations || [],
          conflicts: args.conflicts || [],
          allFilesModified: args.all_files_modified || [],
          allFilesCreated: args.all_files_created || []
        };
      }
    };
    
    super({
      ...baseOptions,
      role: 'supervisor',
      systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
      tools: SUPERVISOR_TOOLS,
      toolExecutors
    });
    
    /**
     * Outputs from agents to be reviewed
     * @type {Array<AgentOutput>}
     */
    this.agentOutputs = agentOutputs;
    
    /**
     * Original task description for context
     * @type {string}
     */
    this.taskDescription = taskDescription;
  }
  
  /**
   * Detects conflicts where multiple agents modified the same file
   * 
   * @returns {Array<FileConflict>} Array of detected conflicts
   * 
   * @typedef {Object} FileConflict
   * @property {string} file - The conflicting file path
   * @property {string[]} agents - IDs of agents that modified this file
   * @property {string} severity - 'high' if modified, 'low' if only one created
   * 
   * @private
   */
  _detectFileConflicts() {
    const fileToAgents = new Map();
    
    // Track which agents modified/created each file
    for (const output of this.agentOutputs) {
      const allFiles = [
        ...(output.filesModified || []),
        ...(output.filesCreated || [])
      ];
      
      for (const file of allFiles) {
        const normalizedPath = file.toLowerCase().replace(/\\/g, '/');
        if (!fileToAgents.has(normalizedPath)) {
          fileToAgents.set(normalizedPath, {
            originalPath: file,
            agents: [],
            wasModified: false,
            wasCreated: false
          });
        }
        
        const entry = fileToAgents.get(normalizedPath);
        entry.agents.push(output.agentId);
        
        if (output.filesModified?.includes(file)) {
          entry.wasModified = true;
        }
        if (output.filesCreated?.includes(file)) {
          entry.wasCreated = true;
        }
      }
    }
    
    // Find files touched by multiple agents
    const conflicts = [];
    for (const [, entry] of fileToAgents) {
      if (entry.agents.length > 1) {
        conflicts.push({
          file: entry.originalPath,
          agents: entry.agents,
          severity: entry.wasModified ? 'high' : 'medium',
          type: entry.wasModified && entry.wasCreated 
            ? 'modify_and_create' 
            : entry.wasModified 
              ? 'multiple_modifications' 
              : 'multiple_creates'
        });
      }
    }
    
    return conflicts;
  }
  
  /**
   * Aggregates all files modified and created across all agents
   * 
   * @returns {Object} Object with filesModified and filesCreated arrays
   * @property {string[]} filesModified - Unique list of all modified files
   * @property {string[]} filesCreated - Unique list of all created files
   * @private
   */
  _aggregateFiles() {
    const modified = new Set();
    const created = new Set();
    
    for (const output of this.agentOutputs) {
      (output.filesModified || []).forEach(f => modified.add(f));
      (output.filesCreated || []).forEach(f => created.add(f));
    }
    
    return {
      filesModified: [...modified],
      filesCreated: [...created]
    };
  }
  
  /**
   * Review and consolidate agent outputs
   * 
   * This is the main entry point for supervision. It:
   * 1. Pre-detects file conflicts
   * 2. Constructs a detailed message for the LLM
   * 3. Runs the agent loop to analyze and generate summary
   * 4. Returns structured results
   * 
   * @returns {Promise<SupervisionResult>} Consolidated supervision result
   * 
   * @typedef {Object} SupervisionResult
   * @property {string} summary - Consolidated summary of all agent work
   * @property {Array<Object>} [agentSummaries] - Individual agent summaries
   * @property {string[]} recommendations - Recommended follow-up actions
   * @property {Array<FileConflict>} conflicts - Detected file conflicts
   * @property {string[]} filesModified - All files that were modified
   * @property {string[]} filesCreated - All files that were created
   * @property {number} iterations - Number of agent loop iterations
   * @property {number} duration - Total execution time in milliseconds
   * 
   * @example
   * const result = await supervisor.supervise();
   * 
   * if (result.conflicts.length > 0) {
   *   console.warn('Conflicts detected:', result.conflicts);
   * }
   * 
   * console.log('Summary:', result.summary);
   * console.log('Recommendations:', result.recommendations);
   */
  async supervise() {
    // Pre-detect conflicts to include in the prompt
    const detectedConflicts = this._detectFileConflicts();
    const aggregatedFiles = this._aggregateFiles();
    
    // Build the supervision message
    let message = `## Supervision Task\n\n`;
    message += `**Original task:** ${this.taskDescription}\n\n`;
    message += `**Number of agents to review:** ${this.agentOutputs.length}\n\n`;
    
    // Include pre-detected conflicts if any
    if (detectedConflicts.length > 0) {
      message += `## Pre-Detected Conflicts\n\n`;
      message += `The following files were touched by multiple agents and may have conflicts:\n\n`;
      for (const conflict of detectedConflicts) {
        message += `- **${conflict.file}**\n`;
        message += `  - Agents involved: ${conflict.agents.join(', ')}\n`;
        message += `  - Severity: ${conflict.severity}\n`;
        message += `  - Type: ${conflict.type}\n`;
      }
      message += `\nPlease verify these potential conflicts by reading the files if needed.\n\n`;
    }
    
    // Include aggregated file summary
    message += `## Files Overview\n\n`;
    message += `- Total files modified: ${aggregatedFiles.filesModified.length}\n`;
    message += `- Total files created: ${aggregatedFiles.filesCreated.length}\n\n`;
    
    // Include each agent's output
    message += `## Agent Outputs to Review\n\n`;
    
    for (const output of this.agentOutputs) {
      message += `### Agent: ${output.agentId} (${output.role})\n\n`;
      
      if (output.expertise) {
        message += `**Expertise:** ${output.expertise}\n\n`;
      }
      
      if (output.result) {
        message += `**Result:**\n`;
        if (typeof output.result === 'string') {
          // Truncate very long results
          const maxLength = 2000;
          const resultText = output.result.length > maxLength
            ? output.result.substring(0, maxLength) + '\n...[truncated]'
            : output.result;
          message += `\`\`\`\n${resultText}\n\`\`\`\n\n`;
        } else {
          const jsonStr = JSON.stringify(output.result, null, 2);
          const maxLength = 2000;
          const resultText = jsonStr.length > maxLength
            ? jsonStr.substring(0, maxLength) + '\n...[truncated]'
            : jsonStr;
          message += `\`\`\`json\n${resultText}\n\`\`\`\n\n`;
        }
      }
      
      if (output.filesModified?.length > 0) {
        message += `**Files modified:** ${output.filesModified.join(', ')}\n`;
      }
      
      if (output.filesCreated?.length > 0) {
        message += `**Files created:** ${output.filesCreated.join(', ')}\n`;
      }
      
      if (output.error) {
        message += `**Error:** ${output.error}\n`;
      }
      
      message += '\n---\n\n';
    }
    
    message += `## Your Task\n\n`;
    message += `Please review all agent outputs above and:\n`;
    message += `1. Verify the pre-detected conflicts (read files if needed)\n`;
    message += `2. Identify any additional issues or inconsistencies\n`;
    message += `3. Assess overall quality and completeness\n`;
    message += `4. Use the generate_summary tool to create a consolidated report\n`;
    
    // Run the agent loop
    const result = await this.run(message);
    
    // Extract supervision result from the terminal tool
    if (result.finalToolResult) {
      return {
        summary: result.finalToolResult.consolidatedSummary,
        agentSummaries: result.finalToolResult.agentSummaries,
        recommendations: result.finalToolResult.recommendations || [],
        conflicts: result.finalToolResult.conflicts || detectedConflicts,
        filesModified: result.finalToolResult.allFilesModified || aggregatedFiles.filesModified,
        filesCreated: result.finalToolResult.allFilesCreated || aggregatedFiles.filesCreated,
        iterations: result.iterations,
        duration: result.duration
      };
    }
    
    // Fallback if no structured result (agent didn't use generate_summary)
    return {
      summary: result.content || 'Supervision completed without structured summary.',
      recommendations: [],
      conflicts: detectedConflicts,
      filesModified: aggregatedFiles.filesModified,
      filesCreated: aggregatedFiles.filesCreated,
      iterations: result.iterations,
      duration: result.duration
    };
  }
  
  /**
   * Quick validation of agent outputs without full LLM analysis
   * 
   * Performs basic checks:
   * - Detects file conflicts
   * - Checks for error states
   * - Validates output structure
   * 
   * @returns {ValidationResult} Quick validation result
   * 
   * @typedef {Object} ValidationResult
   * @property {boolean} hasConflicts - Whether file conflicts were detected
   * @property {boolean} hasErrors - Whether any agent reported errors
   * @property {Array<FileConflict>} conflicts - Detected conflicts
   * @property {string[]} agentsWithErrors - IDs of agents that had errors
   * @property {Object} fileStats - Statistics about files
   */
  quickValidate() {
    const conflicts = this._detectFileConflicts();
    const aggregatedFiles = this._aggregateFiles();
    const agentsWithErrors = this.agentOutputs
      .filter(o => o.error)
      .map(o => o.agentId);
    
    return {
      hasConflicts: conflicts.length > 0,
      hasErrors: agentsWithErrors.length > 0,
      conflicts,
      agentsWithErrors,
      fileStats: {
        totalModified: aggregatedFiles.filesModified.length,
        totalCreated: aggregatedFiles.filesCreated.length,
        filesModified: aggregatedFiles.filesModified,
        filesCreated: aggregatedFiles.filesCreated
      },
      agentCount: this.agentOutputs.length
    };
  }
}

/**
 * Factory function to supervise agent outputs
 * 
 * Convenience function that creates a SupervisorAgent and runs supervision
 * in one call.
 * 
 * @param {string} apiKey - API key for the LLM provider
 * @param {Object} options - Supervision options
 * @param {Array<AgentOutput>} options.agentOutputs - Outputs from agents to review
 * @param {string} options.taskDescription - Original task description
 * @param {string} [options.model] - Model to use
 * @param {number} [options.maxIterations] - Maximum iterations for the agent loop
 * @returns {Promise<SupervisionResult>} Supervision result
 * 
 * @example
 * const result = await superviseWork('sk-...', {
 *   taskDescription: 'Implement authentication system',
 *   agentOutputs: [
 *     {
 *       agentId: 'coder-1',
 *       role: 'coder',
 *       result: 'Implemented login endpoint',
 *       filesModified: ['src/auth/login.js']
 *     },
 *     {
 *       agentId: 'coder-2', 
 *       role: 'coder',
 *       result: 'Implemented logout endpoint',
 *       filesCreated: ['src/auth/logout.js']
 *     }
 *   ]
 * });
 * 
 * console.log(result.summary);
 */
export async function superviseWork(apiKey, options) {
  const agent = new SupervisorAgent({
    apiKey,
    ...options
  });
  
  return await agent.supervise();
}

/**
 * Quick validation without full LLM analysis
 * 
 * Useful for fast pre-checks before running full supervision.
 * 
 * @param {Array<AgentOutput>} agentOutputs - Outputs to validate
 * @param {string} [taskDescription=''] - Task description for context
 * @returns {ValidationResult} Quick validation result
 * 
 * @example
 * const validation = quickValidateOutputs(agentOutputs);
 * 
 * if (validation.hasConflicts) {
 *   console.warn('Conflicts detected, running full supervision...');
 *   const result = await superviseWork(apiKey, { agentOutputs, taskDescription });
 * }
 */
export function quickValidateOutputs(agentOutputs, taskDescription = '') {
  const agent = new SupervisorAgent({
    apiKey: 'not-needed-for-validation',
    agentOutputs,
    taskDescription
  });
  
  return agent.quickValidate();
}
