import fs from 'fs/promises';
import path from 'path';

/**
 * ResultsManager - Handles persisting task results to disk
 * 
 * Folder Structure:
 * results/
 * ├── <task-id>/
 * │   ├── task-manifest.json    (task metadata, status, timestamps)
 * │   ├── execution-log.json    (full event history)
 * │   ├── agents/
 * │   │   ├── <agent-id>/
 * │   │   │   ├── output.json   (agent's output and result)
 * │   │   │   └── conversation.json (optional: agent's conversation history)
 * │   │   └── ...
 * │   ├── context/
 * │   │   └── files.json        (context files gathered for the task)
 * │   └── outputs/
 * │       └── <files>           (final deliverable files if any)
 */
export class ResultsManager {
  /**
   * Create a new ResultsManager instance
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
   * Create the task folder structure
   * @param {string} taskId - The task identifier
   * @returns {Promise<string>} The path to the created task folder
   */
  async createTaskFolder(taskId) {
    const taskPath = this.getTaskPath(taskId);
    
    // Create directories
    await fs.mkdir(path.join(taskPath, 'agents'), { recursive: true });
    await fs.mkdir(path.join(taskPath, 'context'), { recursive: true });
    await fs.mkdir(path.join(taskPath, 'outputs'), { recursive: true });
    await fs.mkdir(path.join(taskPath, 'project'), { recursive: true }); // Project files created by workers
    
    // Create initial manifest
    const manifest = {
      taskId,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agents: [],
      filesModified: [],
      filesCreated: [],
      projectPath: path.join(taskPath, 'project') // Store the project path
    };
    
    await this.writeJSON(path.join(taskPath, 'task-manifest.json'), manifest);
    
    // Create empty execution log
    await this.writeJSON(path.join(taskPath, 'execution-log.json'), { events: [] });
    
    return taskPath;
  }
  
  /**
   * Get the project folder path for a task
   * This is where workers should create/modify files
   * @param {string} taskId - The task identifier
   * @returns {string} The absolute path to the project folder
   */
  getProjectPath(taskId) {
    return path.join(this.getTaskPath(taskId), 'project');
  }
  
  /**
   * Update task manifest with new data
   * @param {string} taskId - The task identifier
   * @param {Object} updates - Fields to update in the manifest
   * @returns {Promise<Object>} The updated manifest
   */
  async updateManifest(taskId, updates) {
    const manifestPath = path.join(this.getTaskPath(taskId), 'task-manifest.json');
    
    try {
      const manifest = await this.readJSON(manifestPath);
      Object.assign(manifest, updates, { updatedAt: new Date().toISOString() });
      await this.writeJSON(manifestPath, manifest);
      return manifest;
    } catch (error) {
      // Manifest doesn't exist, create it
      const manifest = {
        taskId,
        ...updates,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.writeJSON(manifestPath, manifest);
      return manifest;
    }
  }
  
  /**
   * Log an event to the execution log
   * @param {string} taskId - The task identifier
   * @param {Object} event - The event to log
   * @param {string} [event.type] - Event type (e.g., 'agent_started', 'agent_completed')
   * @param {string} [event.agentId] - Associated agent ID if applicable
   * @param {*} [event.data] - Additional event data
   * @param {string} [event.timestamp] - Event timestamp (auto-generated if not provided)
   * @returns {Promise<void>}
   */
  async logEvent(taskId, event) {
    const logPath = path.join(this.getTaskPath(taskId), 'execution-log.json');
    
    try {
      const log = await this.readJSON(logPath);
      log.events.push({
        ...event,
        timestamp: event.timestamp || new Date().toISOString()
      });
      await this.writeJSON(logPath, log);
    } catch (error) {
      // Log doesn't exist, create it
      await this.writeJSON(logPath, {
        events: [{
          ...event,
          timestamp: event.timestamp || new Date().toISOString()
        }]
      });
    }
  }
  
  /**
   * Save agent output to disk
   * @param {string} taskId - The task identifier
   * @param {string} agentId - The agent identifier
   * @param {Object} output - The agent's output data
   * @param {boolean} [output.success] - Whether the agent succeeded
   * @param {*} [output.result] - The agent's result
   * @param {string} [output.error] - Error message if failed
   * @returns {Promise<string>} The path to the agent folder
   */
  async saveAgentOutput(taskId, agentId, output) {
    const agentPath = path.join(this.getTaskPath(taskId), 'agents', agentId);
    await fs.mkdir(agentPath, { recursive: true });
    
    await this.writeJSON(path.join(agentPath, 'output.json'), {
      agentId,
      savedAt: new Date().toISOString(),
      ...output
    });
    
    // Update manifest
    await this.updateManifest(taskId, {
      agents: await this.getAgentIds(taskId)
    });
    
    return agentPath;
  }
  
  /**
   * Save agent conversation history
   * @param {string} taskId - The task identifier
   * @param {string} agentId - The agent identifier
   * @param {Array<Object>} conversation - Array of conversation messages
   * @returns {Promise<void>}
   */
  async saveAgentConversation(taskId, agentId, conversation) {
    const agentPath = path.join(this.getTaskPath(taskId), 'agents', agentId);
    await fs.mkdir(agentPath, { recursive: true });
    
    await this.writeJSON(path.join(agentPath, 'conversation.json'), {
      agentId,
      savedAt: new Date().toISOString(),
      messages: conversation
    });
  }
  
  /**
   * Save context files metadata (not content, to avoid large files)
   * @param {string} taskId - The task identifier
   * @param {Array<Object>} files - Array of context file objects
   * @param {string} files[].path - File path
   * @param {number} [files[].relevance] - Relevance score
   * @param {number} [files[].size] - File size in bytes
   * @param {string} [files[].content] - File content (not saved, only presence noted)
   * @returns {Promise<void>}
   */
  async saveContext(taskId, files) {
    const contextPath = path.join(this.getTaskPath(taskId), 'context', 'files.json');
    
    await this.writeJSON(contextPath, {
      savedAt: new Date().toISOString(),
      fileCount: files.length,
      files: files.map(f => ({
        path: f.path,
        relevance: f.relevance,
        size: f.size,
        // Don't save content to avoid huge files
        hasContent: !!f.content
      }))
    });
  }
  
  /**
   * Save final task output/result
   * @param {string} taskId - The task identifier
   * @param {Object} result - The final result object
   * @param {boolean} result.success - Whether the task succeeded
   * @param {string} [result.summary] - Summary of what was accomplished
   * @param {Array<string>} [result.deliverables] - List of deliverable files/items
   * @returns {Promise<void>}
   */
  async saveFinalOutput(taskId, result) {
    const taskPath = this.getTaskPath(taskId);
    
    // Save result summary
    await this.writeJSON(path.join(taskPath, 'outputs', 'result.json'), {
      savedAt: new Date().toISOString(),
      ...result
    });
    
    // Update manifest
    await this.updateManifest(taskId, {
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      summary: result.summary,
      deliverables: result.deliverables
    });
  }
  
  /**
   * Get list of agent IDs for a task
   * @param {string} taskId - The task identifier
   * @returns {Promise<Array<string>>} Array of agent IDs
   */
  async getAgentIds(taskId) {
    const agentsPath = path.join(this.getTaskPath(taskId), 'agents');
    
    try {
      const entries = await fs.readdir(agentsPath, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
  }
  
  /**
   * Get agent output data
   * @param {string} taskId - The task identifier
   * @param {string} agentId - The agent identifier
   * @returns {Promise<Object>} The agent's output data
   * @throws {Error} If output file doesn't exist
   */
  async getAgentOutput(taskId, agentId) {
    const outputPath = path.join(this.getTaskPath(taskId), 'agents', agentId, 'output.json');
    return await this.readJSON(outputPath);
  }
  
  /**
   * Get task manifest
   * @param {string} taskId - The task identifier
   * @returns {Promise<Object>} The task manifest
   * @throws {Error} If manifest doesn't exist
   */
  async getManifest(taskId) {
    const manifestPath = path.join(this.getTaskPath(taskId), 'task-manifest.json');
    return await this.readJSON(manifestPath);
  }
  
  /**
   * Get execution log for a task
   * @param {string} taskId - The task identifier
   * @returns {Promise<Object>} The execution log with events array
   * @throws {Error} If log doesn't exist
   */
  async getExecutionLog(taskId) {
    const logPath = path.join(this.getTaskPath(taskId), 'execution-log.json');
    return await this.readJSON(logPath);
  }
  
  /**
   * List all tasks with their basic info
   * @returns {Promise<Array<Object>>} Array of task summaries
   */
  async listTasks() {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const tasks = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const manifest = await this.getManifest(entry.name);
            tasks.push({
              taskId: entry.name,
              status: manifest.status,
              createdAt: manifest.createdAt,
              completedAt: manifest.completedAt
            });
          } catch {
            // No manifest, skip
          }
        }
      }
      
      return tasks;
    } catch {
      return [];
    }
  }
  
  /**
   * Delete a task and all its data
   * @param {string} taskId - The task identifier
   * @returns {Promise<void>}
   */
  async deleteTask(taskId) {
    const taskPath = this.getTaskPath(taskId);
    await fs.rm(taskPath, { recursive: true, force: true });
  }
  
  /**
   * Archive a task by moving it to the _archive folder
   * @param {string} taskId - The task identifier
   * @returns {Promise<string>} The path to the archived task
   */
  async archiveTask(taskId) {
    const taskPath = this.getTaskPath(taskId);
    const archivePath = path.join(this.baseDir, '_archive', taskId);
    
    await fs.mkdir(path.join(this.baseDir, '_archive'), { recursive: true });
    await fs.rename(taskPath, archivePath);
    
    return archivePath;
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
export const resultsManager = new ResultsManager();
