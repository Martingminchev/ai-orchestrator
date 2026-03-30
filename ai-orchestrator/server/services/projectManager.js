/**
 * @fileoverview Project Manager service for managing project folders.
 * Handles creation and retrieval of project working directories where
 * workers create their files.
 * @module services/projectManager
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Base path for all projects
 * @type {string}
 */
const PROJECTS_BASE_PATH = path.join(process.cwd(), 'projects');

/**
 * ProjectManager - Manages project folders for worker agents
 * 
 * Projects are stored in: server/projects/{projectName}/
 * Each project is a self-contained folder where workers can:
 * - Create and modify files
 * - Run terminal commands
 * - Build and test their work
 */
export class ProjectManager {
  constructor() {
    this.basePath = PROJECTS_BASE_PATH;
  }
  
  /**
   * Get the absolute path for a project folder
   * @param {string} projectName - Name of the project (sanitized)
   * @returns {string} Absolute path to the project folder
   */
  getProjectPath(projectName) {
    const sanitized = this.sanitizeProjectName(projectName);
    return path.join(this.basePath, sanitized);
  }
  
  /**
   * Sanitize a project name to be filesystem-safe
   * @param {string} name - Raw project name
   * @returns {string} Sanitized name safe for filesystem
   */
  sanitizeProjectName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')  // Replace invalid chars with dash
      .replace(/-+/g, '-')            // Collapse multiple dashes
      .replace(/^-|-$/g, '')          // Remove leading/trailing dashes
      .substring(0, 50);              // Limit length
  }
  
  /**
   * Check if a project folder exists
   * @param {string} projectName - Name of the project
   * @returns {Promise<boolean>} True if project exists
   */
  async projectExists(projectName) {
    const projectPath = this.getProjectPath(projectName);
    try {
      const stats = await fs.stat(projectPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  /**
   * Create a new project folder
   * @param {string} projectName - Name of the project
   * @param {Object} [options={}] - Creation options
   * @param {Object} [options.metadata={}] - Project metadata to store
   * @returns {Promise<{success: boolean, path: string, created: boolean, error?: string}>}
   */
  async createProject(projectName, options = {}) {
    const projectPath = this.getProjectPath(projectName);
    const sanitizedName = this.sanitizeProjectName(projectName);
    
    try {
      // Ensure base projects folder exists
      await fs.mkdir(this.basePath, { recursive: true });
      
      // Check if already exists
      const exists = await this.projectExists(projectName);
      if (exists) {
        return {
          success: true,
          path: projectPath,
          created: false,
          name: sanitizedName
        };
      }
      
      // Create project folder
      await fs.mkdir(projectPath, { recursive: true });
      
      // Create project metadata file
      const metadata = {
        name: sanitizedName,
        originalName: projectName,
        createdAt: new Date().toISOString(),
        ...options.metadata
      };
      
      await fs.writeFile(
        path.join(projectPath, '.project.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      
      console.log(`[ProjectManager] Created project: ${sanitizedName} at ${projectPath}`);
      
      return {
        success: true,
        path: projectPath,
        created: true,
        name: sanitizedName
      };
    } catch (error) {
      console.error(`[ProjectManager] Failed to create project ${projectName}:`, error.message);
      return {
        success: false,
        path: projectPath,
        created: false,
        error: error.message
      };
    }
  }
  
  /**
   * List all projects
   * @returns {Promise<Array<{name: string, path: string, createdAt?: string}>>}
   */
  async listProjects() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const projects = [];
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const projectPath = path.join(this.basePath, entry.name);
          let metadata = {};
          
          try {
            const metaContent = await fs.readFile(
              path.join(projectPath, '.project.json'),
              'utf-8'
            );
            metadata = JSON.parse(metaContent);
          } catch {
            // No metadata file
          }
          
          projects.push({
            name: entry.name,
            path: projectPath,
            createdAt: metadata.createdAt,
            originalName: metadata.originalName
          });
        }
      }
      
      return projects;
    } catch {
      return [];
    }
  }
  
  /**
   * Get project metadata
   * @param {string} projectName - Name of the project
   * @returns {Promise<Object|null>} Project metadata or null if not found
   */
  async getProjectMetadata(projectName) {
    const projectPath = this.getProjectPath(projectName);
    
    try {
      const metaContent = await fs.readFile(
        path.join(projectPath, '.project.json'),
        'utf-8'
      );
      return JSON.parse(metaContent);
    } catch {
      return null;
    }
  }
  
  /**
   * Update project metadata
   * @param {string} projectName - Name of the project
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} True if successful
   */
  async updateProjectMetadata(projectName, updates) {
    const projectPath = this.getProjectPath(projectName);
    
    try {
      let metadata = await this.getProjectMetadata(projectName) || {};
      metadata = {
        ...metadata,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(projectPath, '.project.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Delete a project folder (use with caution!)
   * @param {string} projectName - Name of the project
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteProject(projectName) {
    const projectPath = this.getProjectPath(projectName);
    
    try {
      await fs.rm(projectPath, { recursive: true, force: true });
      console.log(`[ProjectManager] Deleted project: ${projectName}`);
      return true;
    } catch (error) {
      console.error(`[ProjectManager] Failed to delete project ${projectName}:`, error.message);
      return false;
    }
  }
}

// Singleton instance
export const projectManager = new ProjectManager();

export default ProjectManager;
