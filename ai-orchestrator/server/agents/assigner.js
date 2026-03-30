import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ContextAgent } from './contextAgent.js';
import { WorkerAgent } from './workerAgent.js';
import { VerifierAgent, verifyWork } from './verifierAgent.js';
import { agentRegistry } from './agentRegistry.js';
import { resultsManager } from '../services/resultsManager.js';
import { workArchive } from '../services/workArchive.js';
import { createScopedFileManager } from '../services/fileManager.js';
import { projectManager } from '../services/projectManager.js';
import { callKimi } from '../services/kimi.js';
import { PROMPT_GENERATOR_PROMPT, WORKER_AGENT_BASE_PROMPT } from './prompts.js';

/**
 * @typedef {Object} WorkRequest
 * @property {string} expertise - Required expertise (e.g., "React TypeScript developer")
 * @property {string} task - Task description
 * @property {string} [priority='medium'] - Priority level: 'high', 'medium', 'low'
 * @property {Array<string>} [contextHints=[]] - Optional hints about relevant areas
 */

/**
 * @typedef {Object} WorkResult
 * @property {boolean} success - Whether the work was successful
 * @property {string} summary - Summary for the Orchestrator
 * @property {string} [agentId] - ID of the worker agent
 * @property {Array<string>} [filesModified] - List of modified files
 * @property {Array<string>} [filesCreated] - List of created files
 * @property {Array<Object>} [verificationIssues] - Issues found during verification
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} ProgressEvent
 * @property {string} type - Event type
 * @property {string} assignerId - Assigner identifier
 * @property {string} taskId - Parent task ID
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Assigner - The intermediary between Orchestrator and Worker agents.
 * 
 * Receives high-level work requests from the Orchestrator and:
 * 1. Uses Context Agent to gather relevant files
 * 2. Confirms/filters the context
 * 3. Spawns Worker Agent with full context
 * 4. Monitors worker progress
 * 5. Spawns Verifier Agent to validate work
 * 6. Generates summary for Orchestrator (not too small, not too big)
 * 
 * @extends EventEmitter
 * @fires Assigner#progress
 */
export class Assigner extends EventEmitter {
  /**
   * Create an Assigner instance
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Kimi API key
   * @param {string} options.taskId - Parent task ID
   * @param {string} options.projectName - Name of the project to work in
   * @param {Function} [options.onProgress] - Progress callback
   * @param {AbortSignal} [options.abortSignal] - Cancellation signal
   */
  constructor(options) {
    super();
    
    if (!options.apiKey) {
      throw new Error('Assigner requires an API key');
    }
    if (!options.taskId) {
      throw new Error('Assigner requires a task ID');
    }
    if (!options.projectName) {
      throw new Error('Assigner requires a project name');
    }
    
    this.apiKey = options.apiKey;
    this.taskId = options.taskId;
    this.projectName = options.projectName;
    this.onProgress = options.onProgress;
    this.abortSignal = options.abortSignal;
    
    /** @type {string|null} Project path (set after project is created/verified) */
    this.projectPath = null;
    
    /** @type {Map<string, Object>} Track pending work requests */
    this.pendingRequests = new Map();
    
    /** @type {Map<string, Object>} Track completed work requests */
    this.completedRequests = new Map();
    
    /** @type {Map<string, Promise>} Track in-flight requests for concurrency */
    this.activeRequests = new Map();
    
    /** @type {number} Maximum concurrent work requests */
    this.maxConcurrent = 3;
  }
  
  /**
   * Handle a work request from the Orchestrator.
   * Builds context, assigns to worker, verifies, and returns summary.
   * 
   * @param {WorkRequest} request - The work request
   * @returns {Promise<WorkResult>} Result with summary for Orchestrator
   */
  async handleWorkRequest(request) {
    const requestId = `req-${uuidv4().slice(0, 8)}`;
    const { expertise, task, priority = 'medium', contextHints = [] } = request;
    
    // Track this request
    this.pendingRequests.set(requestId, {
      requestId,
      expertise,
      task,
      priority,
      startTime: Date.now()
    });
    
    this.emitProgress('request_received', { requestId, expertise, task, priority });
    
    try {
      // Check for cancellation
      if (this.abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }
      
      // Step 0: Ensure project folder exists
      if (!this.projectPath) {
        this.emitProgress('creating_project', { projectName: this.projectName });
        const projectResult = await projectManager.createProject(this.projectName, {
          metadata: {
            taskId: this.taskId,
            createdBy: 'assigner'
          }
        });
        
        if (!projectResult.success) {
          throw new Error(`Failed to create project folder: ${projectResult.error}`);
        }
        
        this.projectPath = projectResult.path;
        this.emitProgress('project_ready', { 
          projectName: projectResult.name, 
          projectPath: this.projectPath,
          created: projectResult.created 
        });
      }
      
      // Step 1: Check if this is a greenfield project (empty project folder)
      const isGreenfieldProject = await this.isGreenfieldProject();
      
      let loadedFiles = [];
      
      if (isGreenfieldProject) {
        // For greenfield projects, skip context gathering - worker starts fresh
        this.emitProgress('greenfield_project', { 
          projectName: this.projectName,
          message: 'Starting fresh - no existing files to gather context from'
        });
      } else {
        // Step 1b: Gather context from existing project files
        this.emitProgress('gathering_context', { requestId });
        
        // Create a context agent scoped to the project folder
        const scopedContextFileManager = createScopedFileManager(this.projectPath);
        
        const contextAgent = new ContextAgent({
          apiKey: this.apiKey,
          id: `ctx-${uuidv4().slice(0, 8)}`,
          fileManager: scopedContextFileManager,
          onProgress: (event) => this.emitProgress('context_agent_progress', { requestId, ...event }),
          abortSignal: this.abortSignal
        });
        
        agentRegistry.register(contextAgent, {
          taskId: this.taskId,
          expertise: 'context discovery'
        });
        
        const contextResult = await contextAgent.gatherContext(task, {
          hints: contextHints
        });
        
        this.emitProgress('context_gathered', {
          requestId,
          filesFound: contextResult.files?.length || 0,
          summary: contextResult.summary
        });
        
        // Step 2: Confirm/filter context (Assigner decides what's relevant)
        const confirmedFiles = this.confirmContext(contextResult.files, task);
        
        // Step 3: Load file contents for the worker
        loadedFiles = await contextAgent.loadFileContents(confirmedFiles);
        
        this.emitProgress('context_loaded', {
          requestId,
          filesLoaded: loadedFiles.length
        });
      }
      
      // Step 4: Spawn Worker Agent with full context
      this.emitProgress('spawning_worker', { requestId, expertise });
      
      // Generate custom system prompt for the worker using LLM
      this.emitProgress('generating_prompt', { requestId, expertise });
      const customSystemPrompt = await this.generateCustomWorkerPrompt(expertise, task, contextHints);
      
      // Create a scoped FileManager for the worker - all file operations will be
      // restricted to the project folder: server/projects/{projectName}/
      const scopedFileManager = createScopedFileManager(this.projectPath);
      this.emitProgress('scoped_filemanager_created', { requestId, projectPath: this.projectPath });
      
      const workerAgent = new WorkerAgent({
        apiKey: this.apiKey,
        id: `worker-${uuidv4().slice(0, 8)}`,
        expertise,
        customSystemPrompt, // Pass the custom prompt
        fileManager: scopedFileManager, // Pass the scoped file manager
        projectPath: this.projectPath, // Pass the project path for terminal working directory
        taskId: this.taskId,
        contextFiles: loadedFiles,
        onProgress: (event) => this.emitProgress('worker_progress', { requestId, ...event }),
        onContextRequest: (req) => this.handleContextRequest(req, contextAgent),
        abortSignal: this.abortSignal
      });
      
      agentRegistry.register(workerAgent, {
        taskId: this.taskId,
        expertise
      });
      
      // Step 5: Execute the task
      this.emitProgress('worker_executing', { requestId });
      const workResult = await workerAgent.executeTask(task);
      
      // Release any file locks the worker may have acquired
      workerAgent.releaseLocks();
      
      this.emitProgress('work_completed', {
        requestId,
        agentId: workerAgent.id,
        iterations: workResult.iterations
      });
      
      // Step 6: Verify work using Verifier Agent
      const filesModified = workResult.finalToolResult?.filesModified || [];
      const filesCreated = workResult.finalToolResult?.filesCreated || [];
      
      if (filesModified.length > 0 || filesCreated.length > 0) {
        this.emitProgress('verifying_work', { requestId });
        
        const verificationResult = await verifyWork(this.apiKey, {
          filesModified,
          filesCreated,
          taskDescription: task,
          onProgress: (event) => this.emitProgress('verifier_progress', { requestId, ...event }),
          abortSignal: this.abortSignal
        });
        
        if (!verificationResult.passed) {
          this.emitProgress('verification_failed', {
            requestId,
            issues: verificationResult.issues,
            summary: verificationResult.summary
          });
          
          // Move to completed with failure status
          this.moveToCompleted(requestId, 'failed');
          
          return {
            success: false,
            summary: this.generateSummary(workResult, verificationResult, 'failed'),
            agentId: workerAgent.id,
            filesModified,
            filesCreated,
            verificationIssues: verificationResult.issues
          };
        }
        
        // Mark worker as verified in registry
        agentRegistry.updateStatus(workerAgent.id, 'verified');
      }
      
      // Step 7: Generate summary and archive work
      const summary = this.generateSummary(workResult, null, 'success');
      
      // Archive the complete work (saves to disk, keeps memory lean)
      await this.archiveWorkerOutput(workerAgent.id, {
        expertise,
        task,
        customSystemPrompt,
        workResult,
        filesModified,
        filesCreated,
        conversationHistory: workerAgent.conversationHistory
      });
      
      // Save minimal reference for later retrieval
      await resultsManager.saveAgentOutput(this.taskId, workerAgent.id, {
        expertise,
        task,
        summary, // Only summary, full details are archived
        filesModified,
        filesCreated
      });
      
      // Move to completed
      this.moveToCompleted(requestId, 'success');
      
      this.emitProgress('request_completed', { requestId, summary });
      
      return {
        success: true,
        summary,
        agentId: workerAgent.id,
        filesModified,
        filesCreated
      };
      
    } catch (error) {
      // Move to completed with error status
      this.moveToCompleted(requestId, 'error');
      
      this.emitProgress('request_error', { requestId, error: error.message });
      
      // Return failure summary instead of throwing
      return {
        success: false,
        summary: `Work request failed: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Handle multiple work requests in parallel (up to maxConcurrent).
   * 
   * @param {Array<WorkRequest>} requests - Array of work requests
   * @returns {Promise<Array<WorkResult>>} Results for all requests
   */
  async handleWorkRequestsBatch(requests) {
    const results = [];
    const queue = [...requests];
    
    while (queue.length > 0 || this.activeRequests.size > 0) {
      // Fill up to maxConcurrent
      while (queue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
        const request = queue.shift();
        const requestId = `batch-${uuidv4().slice(0, 8)}`;
        
        const promise = this.handleWorkRequest(request)
          .then(result => {
            this.activeRequests.delete(requestId);
            return result;
          })
          .catch(error => {
            this.activeRequests.delete(requestId);
            return { success: false, summary: error.message, error: error.message };
          });
        
        this.activeRequests.set(requestId, promise);
      }
      
      // Wait for at least one to complete
      if (this.activeRequests.size > 0) {
        const completed = await Promise.race(this.activeRequests.values());
        results.push(completed);
      }
    }
    
    return results;
  }
  
  /**
   * Confirm and filter context files - Assigner decides what's needed.
   * 
   * @param {Array<{path: string, relevance: number}>} files - Files suggested by Context Agent
   * @param {string} task - Task description for filtering decisions
   * @returns {Array<{path: string, relevance: number}>} Confirmed files
   * @private
   */
  confirmContext(files, task) {
    if (!files || files.length === 0) {
      return [];
    }
    
    // Sort by relevance score if available (higher first)
    const sortedFiles = [...files].sort((a, b) => {
      const aRel = a.relevance ?? 0.5;
      const bRel = b.relevance ?? 0.5;
      return bRel - aRel;
    });
    
    // Limit to reasonable number of files to avoid context overflow
    // Reduced from 20 to 10 to stay well under API limits
    const maxFiles = 10;
    if (sortedFiles.length > maxFiles) {
      this.emitProgress('context_trimmed', {
        originalCount: sortedFiles.length,
        trimmedCount: maxFiles
      });
      return sortedFiles.slice(0, maxFiles);
    }
    
    return sortedFiles;
  }
  
  /**
   * Handle additional context request from worker during execution.
   * 
   * @param {Object} request - Context request
   * @param {string} request.description - What context is needed
   * @param {Array<string>} [request.suggestedFiles] - Files the worker thinks might help
   * @param {ContextAgent} contextAgent - The context agent to use
   * @returns {Promise<{files: Array, message: string}>}
   * @private
   */
  async handleContextRequest(request, contextAgent) {
    const { description, suggestedFiles = [] } = request;
    
    this.emitProgress('worker_context_request', { description });
    
    try {
      // Use Context Agent to find additional files
      const additionalContext = await contextAgent.gatherContext(description, {
        hints: suggestedFiles
      });
      
      // Load the file contents
      const loadedFiles = await contextAgent.loadFileContents(additionalContext.files);
      
      this.emitProgress('worker_context_provided', {
        filesProvided: loadedFiles.length
      });
      
      return {
        files: loadedFiles,
        message: `Found ${loadedFiles.length} additional files`
      };
    } catch (error) {
      this.emitProgress('worker_context_error', { error: error.message });
      
      return {
        files: [],
        message: `Failed to gather additional context: ${error.message}`
      };
    }
  }
  
  /**
   * Generate summary for Orchestrator.
   * Not too small, not too big - informative but lean.
   * 
   * @param {Object} workResult - Result from worker execution
   * @param {Object|null} verificationResult - Result from verifier (if any)
   * @param {string} status - 'success' | 'failed'
   * @returns {string} Summary string
   * @private
   */
  generateSummary(workResult, verificationResult, status) {
    const parts = [];
    
    // Status indicator
    if (status === 'success') {
      parts.push('✓ Work completed successfully.');
    } else if (status === 'failed') {
      parts.push('✗ Work completed but verification failed.');
    }
    
    // What was done (from worker's summary)
    if (workResult.finalToolResult?.summary) {
      parts.push(`\nSummary: ${workResult.finalToolResult.summary}`);
    } else if (workResult.content) {
      // Truncate if too long to keep summary lean
      const content = workResult.content;
      const maxLength = 500;
      if (content.length > maxLength) {
        parts.push(`\n${content.slice(0, maxLength)}...`);
      } else {
        parts.push(`\n${content}`);
      }
    }
    
    // Files changed
    const filesModified = workResult.finalToolResult?.filesModified || [];
    const filesCreated = workResult.finalToolResult?.filesCreated || [];
    
    if (filesModified.length > 0) {
      parts.push(`\nFiles modified: ${filesModified.join(', ')}`);
    }
    if (filesCreated.length > 0) {
      parts.push(`\nFiles created: ${filesCreated.join(', ')}`);
    }
    
    // Verification issues if any
    if (verificationResult?.issues?.length > 0) {
      const errors = verificationResult.issues.filter(i => i.severity === 'error');
      const warnings = verificationResult.issues.filter(i => i.severity === 'warning');
      
      if (errors.length > 0) {
        parts.push(`\nErrors (${errors.length}): ${errors.map(e => e.description).join('; ')}`);
      }
      if (warnings.length > 0) {
        parts.push(`\nWarnings (${warnings.length}): ${warnings.map(w => w.description).join('; ')}`);
      }
    }
    
    // Execution stats
    const durationSec = Math.round((workResult.duration || 0) / 1000);
    parts.push(`\n[${workResult.iterations || 0} iterations, ${durationSec}s]`);
    
    return parts.join('');
  }
  
  /**
   * Generate a custom system prompt for a worker using the LLM.
   * Creates a tailored prompt based on expertise, task, and context hints.
   * 
   * @param {string} expertise - Required expertise (e.g., "React TypeScript developer")
   * @param {string} task - Task description
   * @param {Array<string>} contextHints - Hints about relevant areas
   * @returns {Promise<string>} Custom system prompt for the worker
   * @private
   */
  async generateCustomWorkerPrompt(expertise, task, contextHints = []) {
    const promptInput = `## Worker Requirements

**Expertise Required:** ${expertise}

**Task:** ${task}

${contextHints.length > 0 ? `**Context Hints:** ${contextHints.join(', ')}` : ''}

Generate a system prompt for this worker.`;

    try {
      const response = await callKimi(this.apiKey, [
        { role: 'system', content: PROMPT_GENERATOR_PROMPT },
        { role: 'user', content: promptInput }
      ]);
      
      // Combine generated prompt with base worker instructions
      const generatedPrompt = response.content.trim();
      const fullPrompt = `${generatedPrompt}\n\n${WORKER_AGENT_BASE_PROMPT}`;
      
      console.log(`[Assigner] Generated custom prompt for ${expertise}: ${generatedPrompt.slice(0, 200)}...`);
      
      return fullPrompt;
    } catch (error) {
      console.error('[Assigner] Failed to generate custom prompt, using fallback:', error.message);
      // Fallback to basic prompt if generation fails
      return `You are a specialized Worker Agent with expertise in: ${expertise}\n\n${WORKER_AGENT_BASE_PROMPT}`;
    }
  }
  
  /**
   * Archive worker output to disk for later retrieval.
   * Keeps memory lean by only storing summary in memory, full details on disk.
   * 
   * @param {string} workerId - Worker agent ID
   * @param {Object} data - Data to archive
   * @param {string} data.expertise - Worker expertise
   * @param {string} data.task - Task description
   * @param {string} data.customSystemPrompt - System prompt used
   * @param {Object} data.workResult - Complete work result
   * @param {Array<string>} data.filesModified - Modified files
   * @param {Array<string>} data.filesCreated - Created files
   * @param {Array<Object>} data.conversationHistory - Full conversation
   * @returns {Promise<void>}
   * @private
   */
  async archiveWorkerOutput(workerId, data) {
    const { expertise, task, customSystemPrompt, workResult, filesModified, filesCreated, conversationHistory } = data;
    
    try {
      await workArchive.saveWorkerOutput(this.taskId, workerId, {
        summary: workResult.finalToolResult?.summary || workResult.content || 'No summary available',
        filesCreated,
        filesModified,
        fullResult: {
          expertise,
          task,
          iterations: workResult.iterations,
          duration: workResult.duration,
          content: workResult.content,
          finalToolResult: workResult.finalToolResult,
          toolsUsed: workResult.toolsUsed
        },
        conversation: conversationHistory,
        systemPrompt: customSystemPrompt,
        duration: workResult.duration,
        tokenUsage: workResult.tokenUsage
      });
      
      console.log(`[Assigner] Archived work for ${workerId} to disk`);
      this.emitProgress('work_archived', { workerId });
    } catch (error) {
      console.error(`[Assigner] Failed to archive work for ${workerId}:`, error.message);
      // Non-fatal: continue even if archiving fails
    }
  }
  
  /**
   * Move a request from pending to completed.
   * 
   * @param {string} requestId - Request ID
   * @param {string} status - Final status
   * @private
   */
  moveToCompleted(requestId, status) {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      this.pendingRequests.delete(requestId);
      this.completedRequests.set(requestId, {
        ...request,
        status,
        endTime: Date.now(),
        duration: Date.now() - request.startTime
      });
    }
  }
  
  /**
   * Get status of all requests.
   * 
   * @returns {{pending: Array, completed: Array, active: number}}
   */
  getStatus() {
    return {
      pending: Array.from(this.pendingRequests.values()),
      completed: Array.from(this.completedRequests.values()),
      active: this.activeRequests.size
    };
  }
  
  /**
   * Check if the project folder is empty (greenfield project).
   * 
   * @returns {Promise<boolean>} True if project is new/empty
   * @private
   */
  async isGreenfieldProject() {
    if (!this.projectPath) {
      return true; // No project path = assume greenfield
    }
    
    try {
      const fs = await import('fs/promises');
      const entries = await fs.readdir(this.projectPath);
      // Filter out metadata files we create
      const projectFiles = entries.filter(e => !e.startsWith('.project'));
      return projectFiles.length === 0;
    } catch {
      return true; // Error reading = assume greenfield
    }
  }
  
  /**
   * Emit a progress event.
   * 
   * @param {string} type - Event type
   * @param {Object} [data={}] - Additional event data
   * @fires Assigner#progress
   * @private
   */
  emitProgress(type, data = {}) {
    const event = {
      type,
      assignerId: 'assigner',
      taskId: this.taskId,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    /**
     * Progress event
     * @event Assigner#progress
     * @type {ProgressEvent}
     */
    this.emit('progress', event);
    
    if (this.onProgress) {
      this.onProgress(event);
    }
  }
}

/**
 * Factory function to create an Assigner instance.
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Kimi API key
 * @param {string} options.taskId - Parent task ID
 * @param {Function} [options.onProgress] - Progress callback
 * @param {AbortSignal} [options.abortSignal] - Cancellation signal
 * @returns {Assigner} New Assigner instance
 */
export function createAssigner(options) {
  return new Assigner(options);
}

export default Assigner;
