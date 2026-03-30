import fs from 'fs/promises';
import path from 'path';

/**
 * WorkArchive - Handles file-based archiving of worker outputs
 * 
 * Saves full work details to disk while keeping only summaries in memory.
 * This allows the orchestrator to manage large-scale tasks without memory bloat.
 * 
 * Directory Structure:
 * results/{taskId}/
 *   ├── workers/
 *   │   ├── {workerId}/
 *   │   │   ├── summary.json        // Brief summary for orchestrator
 *   │   │   ├── full-output.json    // Complete work details
 *   │   │   ├── files-changed.json  // List of files created/modified
 *   │   │   └── conversation.json   // Full agent conversation (for debugging)
 *   │   └── ...
 *   ├── summaries/
 *   │   └── consolidated.json       // All work summaries in one place
 *   └── final-output.json
 */
export class WorkArchive {
  /**
   * Create a new WorkArchive instance
   * @param {Object} options - Configuration options
   * @param {string} [options.baseDir] - Base directory for results (default: './results')
   */
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'results');
  }

  /**
   * Get the path for a task folder
   * @param {string} taskId - The task identifier
   * @returns {string} The absolute path to the task folder
   */
  getTaskPath(taskId) {
    return path.join(this.baseDir, taskId);
  }

  /**
   * Get the path for a worker folder
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {string} The absolute path to the worker folder
   */
  getWorkerPath(taskId, workerId) {
    return path.join(this.getTaskPath(taskId), 'workers', workerId);
  }

  /**
   * Get the path for the summaries folder
   * @param {string} taskId - The task identifier
   * @returns {string} The absolute path to the summaries folder
   */
  getSummariesPath(taskId) {
    return path.join(this.getTaskPath(taskId), 'summaries');
  }

  /**
   * Save complete worker output to disk
   * 
   * Creates the directory structure if needed and saves output to appropriate JSON files:
   * - summary.json: Brief summary for orchestrator reference
   * - full-output.json: Complete work details including full result
   * - files-changed.json: List of files created and modified
   * - conversation.json: Full agent conversation for debugging
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @param {Object} output - The complete worker output
   * @param {string} output.summary - Brief summary of the work done
   * @param {Array<string>} [output.filesCreated] - List of files created by the worker
   * @param {Array<string>} [output.filesModified] - List of files modified by the worker
   * @param {*} output.fullResult - Complete result data from the worker
   * @param {Array<Object>} [output.conversation] - Full conversation history with the agent
   * @param {string} [output.systemPrompt] - System prompt used for the agent
   * @param {number} [output.duration] - Duration of the work in milliseconds
   * @param {Object} [output.tokenUsage] - Token usage statistics
   * @param {number} [output.tokenUsage.input] - Input tokens used
   * @param {number} [output.tokenUsage.output] - Output tokens used
   * @param {number} [output.tokenUsage.total] - Total tokens used
   * @returns {Promise<string>} The path to the worker folder
   */
  async saveWorkerOutput(taskId, workerId, output) {
    const workerPath = this.getWorkerPath(taskId, workerId);
    
    // Create worker directory
    await fs.mkdir(workerPath, { recursive: true });
    
    const timestamp = new Date().toISOString();
    
    // Save summary (brief info for orchestrator)
    const summaryData = {
      workerId,
      taskId,
      summary: output.summary,
      filesCreatedCount: output.filesCreated?.length || 0,
      filesModifiedCount: output.filesModified?.length || 0,
      duration: output.duration,
      tokenUsage: output.tokenUsage,
      savedAt: timestamp
    };
    await this.writeJSON(path.join(workerPath, 'summary.json'), summaryData);
    
    // Save full output (complete work details)
    const fullOutputData = {
      workerId,
      taskId,
      summary: output.summary,
      fullResult: output.fullResult,
      systemPrompt: output.systemPrompt,
      duration: output.duration,
      tokenUsage: output.tokenUsage,
      savedAt: timestamp
    };
    await this.writeJSON(path.join(workerPath, 'full-output.json'), fullOutputData);
    
    // Save files changed
    const filesChangedData = {
      workerId,
      taskId,
      filesCreated: output.filesCreated || [],
      filesModified: output.filesModified || [],
      savedAt: timestamp
    };
    await this.writeJSON(path.join(workerPath, 'files-changed.json'), filesChangedData);
    
    // Save conversation (for debugging)
    if (output.conversation) {
      const conversationData = {
        workerId,
        taskId,
        messages: output.conversation,
        systemPrompt: output.systemPrompt,
        savedAt: timestamp
      };
      await this.writeJSON(path.join(workerPath, 'conversation.json'), conversationData);
    }
    
    return workerPath;
  }

  /**
   * Get brief summary for a specific worker
   * 
   * Returns the summary.json contents which includes:
   * - workerId, taskId
   * - summary text
   * - file counts (created/modified)
   * - duration and token usage
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {Promise<Object>} The worker summary object
   * @throws {Error} If summary file doesn't exist
   */
  async getWorkerSummary(taskId, workerId) {
    const summaryPath = path.join(this.getWorkerPath(taskId, workerId), 'summary.json');
    return await this.readJSON(summaryPath);
  }

  /**
   * Get complete output for a specific worker
   * 
   * Returns the full-output.json contents which includes:
   * - All summary data
   * - fullResult with complete work details
   * - systemPrompt used
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {Promise<Object>} The complete worker output
   * @throws {Error} If full-output file doesn't exist
   */
  async getWorkerFullOutput(taskId, workerId) {
    const fullOutputPath = path.join(this.getWorkerPath(taskId, workerId), 'full-output.json');
    return await this.readJSON(fullOutputPath);
  }

  /**
   * Get files changed data for a specific worker
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {Promise<Object>} Object containing filesCreated and filesModified arrays
   * @throws {Error} If files-changed file doesn't exist
   */
  async getWorkerFilesChanged(taskId, workerId) {
    const filesChangedPath = path.join(this.getWorkerPath(taskId, workerId), 'files-changed.json');
    return await this.readJSON(filesChangedPath);
  }

  /**
   * Get conversation history for a specific worker
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {Promise<Object>} Object containing messages array and systemPrompt
   * @throws {Error} If conversation file doesn't exist
   */
  async getWorkerConversation(taskId, workerId) {
    const conversationPath = path.join(this.getWorkerPath(taskId, workerId), 'conversation.json');
    return await this.readJSON(conversationPath);
  }

  /**
   * Get summaries for all workers in a task
   * 
   * Reads all worker directories and returns their summary.json contents.
   * Returns an empty array if no workers exist for the task.
   * 
   * @param {string} taskId - The task identifier
   * @returns {Promise<Array<Object>>} Array of worker summary objects
   */
  async getAllWorkerSummaries(taskId) {
    const workersPath = path.join(this.getTaskPath(taskId), 'workers');
    
    try {
      const entries = await fs.readdir(workersPath, { withFileTypes: true });
      const summaries = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const summary = await this.getWorkerSummary(taskId, entry.name);
            summaries.push(summary);
          } catch {
            // Skip workers without valid summary
          }
        }
      }
      
      return summaries;
    } catch {
      // Workers directory doesn't exist
      return [];
    }
  }

  /**
   * Save consolidated summary for the entire task
   * 
   * This summary aggregates all worker summaries and provides
   * a single-file overview of the task's work.
   * 
   * @param {string} taskId - The task identifier
   * @param {Object} summary - The consolidated summary object
   * @param {string} [summary.taskSummary] - Overall summary of the task
   * @param {Array<Object>} [summary.workerSummaries] - Array of individual worker summaries
   * @param {Object} [summary.aggregatedStats] - Aggregated statistics
   * @param {number} [summary.aggregatedStats.totalDuration] - Total duration across all workers
   * @param {Object} [summary.aggregatedStats.totalTokenUsage] - Total token usage
   * @param {number} [summary.aggregatedStats.totalFilesCreated] - Total files created
   * @param {number} [summary.aggregatedStats.totalFilesModified] - Total files modified
   * @returns {Promise<void>}
   */
  async saveConsolidatedSummary(taskId, summary) {
    const summariesPath = this.getSummariesPath(taskId);
    await fs.mkdir(summariesPath, { recursive: true });
    
    const consolidatedData = {
      taskId,
      ...summary,
      savedAt: new Date().toISOString()
    };
    
    await this.writeJSON(path.join(summariesPath, 'consolidated.json'), consolidatedData);
  }

  /**
   * Get the consolidated summary for a task
   * 
   * @param {string} taskId - The task identifier
   * @returns {Promise<Object>} The consolidated summary object
   * @throws {Error} If consolidated summary doesn't exist
   */
  async getConsolidatedSummary(taskId) {
    const consolidatedPath = path.join(this.getSummariesPath(taskId), 'consolidated.json');
    return await this.readJSON(consolidatedPath);
  }

  /**
   * Save final output for the entire task
   * 
   * @param {string} taskId - The task identifier
   * @param {Object} output - The final output object
   * @param {boolean} output.success - Whether the task completed successfully
   * @param {string} [output.summary] - Final summary of the task
   * @param {*} [output.result] - Final result data
   * @param {string} [output.error] - Error message if failed
   * @returns {Promise<void>}
   */
  async saveFinalOutput(taskId, output) {
    const taskPath = this.getTaskPath(taskId);
    await fs.mkdir(taskPath, { recursive: true });
    
    const finalOutputData = {
      taskId,
      ...output,
      savedAt: new Date().toISOString()
    };
    
    await this.writeJSON(path.join(taskPath, 'final-output.json'), finalOutputData);
  }

  /**
   * Get the final output for a task
   * 
   * @param {string} taskId - The task identifier
   * @returns {Promise<Object>} The final output object
   * @throws {Error} If final-output file doesn't exist
   */
  async getFinalOutput(taskId) {
    const finalOutputPath = path.join(this.getTaskPath(taskId), 'final-output.json');
    return await this.readJSON(finalOutputPath);
  }

  /**
   * Check if an archive exists for a specific worker
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {Promise<boolean>} True if archive exists, false otherwise
   */
  async archiveExists(taskId, workerId) {
    const summaryPath = path.join(this.getWorkerPath(taskId, workerId), 'summary.json');
    return await this.exists(summaryPath);
  }

  /**
   * Check if a task archive exists
   * 
   * @param {string} taskId - The task identifier
   * @returns {Promise<boolean>} True if task archive exists, false otherwise
   */
  async taskArchiveExists(taskId) {
    const taskPath = this.getTaskPath(taskId);
    return await this.exists(taskPath);
  }

  /**
   * Get list of all worker IDs for a task
   * 
   * @param {string} taskId - The task identifier
   * @returns {Promise<Array<string>>} Array of worker IDs
   */
  async getWorkerIds(taskId) {
    const workersPath = path.join(this.getTaskPath(taskId), 'workers');
    
    try {
      const entries = await fs.readdir(workersPath, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Delete a worker's archive
   * 
   * @param {string} taskId - The task identifier
   * @param {string} workerId - The worker identifier
   * @returns {Promise<void>}
   */
  async deleteWorkerArchive(taskId, workerId) {
    const workerPath = this.getWorkerPath(taskId, workerId);
    await fs.rm(workerPath, { recursive: true, force: true });
  }

  /**
   * Delete an entire task archive
   * 
   * @param {string} taskId - The task identifier
   * @returns {Promise<void>}
   */
  async deleteTaskArchive(taskId) {
    const taskPath = this.getTaskPath(taskId);
    await fs.rm(taskPath, { recursive: true, force: true });
  }

  // ============================================
  // Helper methods
  // ============================================
  
  /**
   * Read and parse a JSON file
   * @param {string} filePath - Path to the JSON file
   * @returns {Promise<*>} Parsed JSON data
   * @throws {Error} If file doesn't exist or is invalid JSON
   */
  async readJSON(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }
  
  /**
   * Write data to a JSON file (creates directories as needed)
   * @param {string} filePath - Path to the JSON file
   * @param {*} data - Data to serialize and write
   * @returns {Promise<void>}
   */
  async writeJSON(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
  
  /**
   * Check if a file or directory exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>} True if exists, false otherwise
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const workArchive = new WorkArchive();
