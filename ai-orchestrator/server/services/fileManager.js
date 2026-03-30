/**
 * @fileoverview Safe file management service for AI agents with scope control.
 * Provides secure file operations restricted to a configurable base path.
 * @module services/fileManager
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createReadStream } from 'fs';

/**
 * Default configuration values
 */
const DEFAULTS = {
  allowedBasePath: process.cwd(), // Default to current working directory
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxDepth: 5,
  maxResults: 100,
  encoding: 'utf-8'
};

// Store the default results path for scoped instances
const RESULTS_BASE_PATH = path.join(process.cwd(), 'results');

/**
 * File entry type returned by directory listing
 * @typedef {Object} FileEntry
 * @property {string} name - File or directory name
 * @property {string} path - Relative path from allowedBasePath
 * @property {'file'|'directory'} type - Entry type
 * @property {number} [size] - File size in bytes (for files only)
 * @property {Date} modified - Last modification date
 * @property {FileEntry[]} [children] - Child entries (for recursive directory listing)
 */

/**
 * Match result for content search
 * @typedef {Object} SearchMatch
 * @property {number} line - Line number (1-indexed)
 * @property {string} content - Line content
 * @property {number} [column] - Column position of match (0-indexed)
 */

/**
 * Search result for a single file
 * @typedef {Object} SearchResult
 * @property {string} path - Relative file path
 * @property {SearchMatch[]} matches - Array of matches in the file
 */

/**
 * Safe file management service for AI agents with scope control.
 * All file operations are restricted to the configured base path to prevent
 * unauthorized access to the file system.
 */
export class FileManager {
  /**
   * Creates a new FileManager instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.allowedBasePath] - Base path for all operations (default: C:\Users\marti\Desktop\Projects)
   * @param {number} [options.maxFileSize] - Maximum file size to read in bytes (default: 10MB)
   */
  constructor(options = {}) {
    this.allowedBasePath = path.normalize(
      options.allowedBasePath || DEFAULTS.allowedBasePath
    );
    this.maxFileSize = options.maxFileSize || DEFAULTS.maxFileSize;
  }

  /**
   * Normalizes a path and removes any directory traversal attempts
   * @private
   * @param {string} inputPath - Path to normalize
   * @returns {string} Normalized absolute path
   */
  _normalizePath(inputPath) {
    // Normalize the path to handle different separators and resolve . and ..
    let normalized = path.normalize(inputPath);
    
    // If it's a relative path, resolve it against the allowed base path
    if (!path.isAbsolute(normalized)) {
      normalized = path.resolve(this.allowedBasePath, normalized);
    }
    
    return normalized;
  }

  /**
   * Checks if a path is within the allowed base path
   * @param {string} inputPath - Path to validate (can be relative or absolute)
   * @returns {boolean} True if path is allowed, false otherwise
   */
  isPathAllowed(inputPath) {
    try {
      const normalizedPath = this._normalizePath(inputPath);
      const normalizedBase = this.allowedBasePath;
      
      // Check if the normalized path starts with the base path
      // Add separator to prevent matching partial directory names
      // e.g., prevent /Projects-malicious from matching /Projects
      const pathWithSep = normalizedPath.toLowerCase() + path.sep;
      const baseWithSep = normalizedBase.toLowerCase() + path.sep;
      
      return pathWithSep.startsWith(baseWithSep) || 
             normalizedPath.toLowerCase() === normalizedBase.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Resolves a relative path to an absolute path and validates it
   * @param {string} relativePath - Relative path to resolve
   * @param {string} [basePath] - Base path to resolve against (default: allowedBasePath)
   * @returns {string} Resolved absolute path
   * @throws {Error} If the resolved path is outside the allowed base path
   */
  resolvePath(relativePath, basePath) {
    const base = basePath ? this._normalizePath(basePath) : this.allowedBasePath;
    const resolved = path.resolve(base, relativePath);
    const normalized = path.normalize(resolved);
    
    if (!this.isPathAllowed(normalized)) {
      throw new Error(`Path is outside allowed directory: ${relativePath}`);
    }
    
    return normalized;
  }

  /**
   * Converts an absolute path to a path relative to allowedBasePath
   * @private
   * @param {string} absolutePath - Absolute path to convert
   * @returns {string} Relative path
   */
  _toRelativePath(absolutePath) {
    return path.relative(this.allowedBasePath, absolutePath);
  }

  /**
   * Reads a file with safety checks
   * @param {string} filePath - Path to the file (relative or absolute)
   * @param {Object} [options={}] - Read options
   * @param {string} [options.encoding='utf-8'] - File encoding
   * @param {number} [options.maxSize] - Override max file size limit
   * @returns {Promise<{success: boolean, content?: string, error?: string, metadata: {path: string, size: number, modified: Date, created: Date}}>}
   */
  async readFile(filePath, options = {}) {
    const encoding = options.encoding || DEFAULTS.encoding;
    const maxSize = options.maxSize || this.maxFileSize;
    
    try {
      const absolutePath = this.resolvePath(filePath);
      const stats = await fs.stat(absolutePath);
      
      if (!stats.isFile()) {
        return {
          success: false,
          error: 'Path is not a file',
          metadata: {
            path: this._toRelativePath(absolutePath),
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime
          }
        };
      }
      
      if (stats.size > maxSize) {
        return {
          success: false,
          error: `File size (${stats.size} bytes) exceeds maximum allowed (${maxSize} bytes)`,
          metadata: {
            path: this._toRelativePath(absolutePath),
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime
          }
        };
      }
      
      const content = await fs.readFile(absolutePath, { encoding });
      
      return {
        success: true,
        content,
        metadata: {
          path: this._toRelativePath(absolutePath),
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          path: filePath,
          size: 0,
          modified: new Date(0),
          created: new Date(0)
        }
      };
    }
  }

  /**
   * Writes content to a file with safety checks
   * @param {string} filePath - Path to the file (relative or absolute)
   * @param {string} content - Content to write
   * @param {Object} [options={}] - Write options
   * @param {boolean} [options.createDirectories=true] - Create parent directories if they don't exist
   * @param {boolean} [options.overwrite=true] - Overwrite existing file
   * @param {string} [options.encoding='utf-8'] - File encoding
   * @returns {Promise<{success: boolean, error?: string, path: string, bytesWritten: number, created: boolean}>}
   */
  async writeFile(filePath, content, options = {}) {
    const createDirectories = options.createDirectories !== false;
    const overwrite = options.overwrite !== false;
    const encoding = options.encoding || DEFAULTS.encoding;
    
    try {
      const absolutePath = this.resolvePath(filePath);
      const relativePath = this._toRelativePath(absolutePath);
      
      // Check if file exists
      let fileExists = false;
      try {
        await fs.access(absolutePath);
        fileExists = true;
      } catch {
        fileExists = false;
      }
      
      if (fileExists && !overwrite) {
        return {
          success: false,
          error: 'File already exists and overwrite is disabled',
          path: relativePath,
          bytesWritten: 0,
          created: false
        };
      }
      
      // Create parent directories if needed
      if (createDirectories) {
        const dirPath = path.dirname(absolutePath);
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      // Write the file
      await fs.writeFile(absolutePath, content, { encoding });
      const stats = await fs.stat(absolutePath);
      
      return {
        success: true,
        path: relativePath,
        bytesWritten: stats.size,
        created: !fileExists
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
        bytesWritten: 0,
        created: false
      };
    }
  }

  /**
   * Lists contents of a directory
   * @param {string} dirPath - Path to the directory (relative or absolute)
   * @param {Object} [options={}] - List options
   * @param {boolean} [options.recursive=false] - List recursively
   * @param {number} [options.maxDepth=5] - Maximum depth for recursive listing
   * @param {boolean} [options.includeHidden=false] - Include hidden files (starting with .)
   * @param {string} [options.pattern] - Glob pattern filter for file names
   * @returns {Promise<{success: boolean, error?: string, path: string, entries: FileEntry[]}>}
   */
  async listDirectory(dirPath, options = {}) {
    const recursive = options.recursive || false;
    const maxDepth = options.maxDepth || DEFAULTS.maxDepth;
    const includeHidden = options.includeHidden || false;
    const pattern = options.pattern;
    
    try {
      const absolutePath = this.resolvePath(dirPath);
      const relativePath = this._toRelativePath(absolutePath);
      
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: 'Path is not a directory',
          path: relativePath,
          entries: []
        };
      }
      
      const entries = await this._listDirectoryRecursive(
        absolutePath,
        recursive ? maxDepth : 0,
        includeHidden,
        pattern
      );
      
      return {
        success: true,
        path: relativePath,
        entries
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: dirPath,
        entries: []
      };
    }
  }

  /**
   * Recursively lists directory contents
   * @private
   * @param {string} dirPath - Absolute directory path
   * @param {number} depth - Remaining depth for recursion
   * @param {boolean} includeHidden - Include hidden files
   * @param {string} [pattern] - Glob pattern filter
   * @returns {Promise<FileEntry[]>}
   */
  async _listDirectoryRecursive(dirPath, depth, includeHidden, pattern) {
    // Directories to exclude from listing (same as _getAllFiles for consistency)
    const EXCLUDED_DIRS = ['node_modules', 'dist', 'build', '.git', '__pycache__', 'venv', '.next', 'coverage', '.turbo', '.cache'];
    
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];
    
    for (const entry of entries) {
      // Skip hidden files if not included
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }
      
      // Skip common large/non-source directories to prevent context overflow
      if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) {
        continue;
      }
      
      // Apply pattern filter if specified
      if (pattern && !this._matchGlob(entry.name, pattern)) {
        continue;
      }
      
      const entryPath = path.join(dirPath, entry.name);
      const stats = await fs.stat(entryPath);
      
      const fileEntry = {
        name: entry.name,
        path: this._toRelativePath(entryPath),
        type: entry.isDirectory() ? 'directory' : 'file',
        modified: stats.mtime
      };
      
      if (entry.isFile()) {
        fileEntry.size = stats.size;
      }
      
      if (entry.isDirectory() && depth > 0) {
        fileEntry.children = await this._listDirectoryRecursive(
          entryPath,
          depth - 1,
          includeHidden,
          pattern
        );
      }
      
      results.push(fileEntry);
    }
    
    return results;
  }

  /**
   * Simple glob pattern matching
   * @private
   * @param {string} str - String to match
   * @param {string} pattern - Glob pattern (supports * and ?)
   * @returns {boolean} True if matches
   */
  _matchGlob(str, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*')                  // * matches any characters
      .replace(/\?/g, '.');                  // ? matches single character
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(str);
  }

  /**
   * Creates a directory
   * @param {string} dirPath - Path to create (relative or absolute)
   * @param {Object} [options={}] - Create options
   * @param {boolean} [options.recursive=true] - Create parent directories (like mkdir -p)
   * @returns {Promise<{success: boolean, error?: string, path: string, created: boolean}>}
   */
  async createDirectory(dirPath, options = {}) {
    const recursive = options.recursive !== false;
    
    try {
      const absolutePath = this.resolvePath(dirPath);
      const relativePath = this._toRelativePath(absolutePath);
      
      // Check if already exists
      let exists = false;
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
          exists = true;
        } else {
          return {
            success: false,
            error: 'Path exists but is not a directory',
            path: relativePath,
            created: false
          };
        }
      } catch {
        exists = false;
      }
      
      if (exists) {
        return {
          success: true,
          path: relativePath,
          created: false
        };
      }
      
      await fs.mkdir(absolutePath, { recursive });
      
      return {
        success: true,
        path: relativePath,
        created: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: dirPath,
        created: false
      };
    }
  }

  /**
   * Searches for content within files using regex
   * @param {string} pattern - Regex pattern to search for
   * @param {Object} [options={}] - Search options
   * @param {string} [options.basePath] - Base path to search in (default: allowedBasePath)
   * @param {string} [options.filePattern] - Glob pattern for file names (e.g., "*.ts")
   * @param {number} [options.maxResults=100] - Maximum number of results
   * @param {boolean} [options.includeContent=true] - Include matching line content
   * @returns {Promise<{success: boolean, error?: string, pattern: string, results: SearchResult[], totalMatches: number, truncated: boolean}>}
   */
  async searchFiles(pattern, options = {}) {
    const basePath = options.basePath 
      ? this.resolvePath(options.basePath) 
      : this.allowedBasePath;
    const filePattern = options.filePattern;
    const maxResults = options.maxResults || DEFAULTS.maxResults;
    const includeContent = options.includeContent !== false;
    
    try {
      let regex;
      try {
        regex = new RegExp(pattern, 'gim');
      } catch (e) {
        return {
          success: false,
          error: `Invalid regex pattern: ${e.message}`,
          pattern,
          results: [],
          totalMatches: 0,
          truncated: false
        };
      }
      
      const results = [];
      let totalMatches = 0;
      let truncated = false;
      
      // Get all files recursively
      const files = await this._getAllFiles(basePath, filePattern);
      
      for (const file of files) {
        if (totalMatches >= maxResults) {
          truncated = true;
          break;
        }
        
        try {
          const stats = await fs.stat(file);
          // Skip large files
          if (stats.size > this.maxFileSize) {
            continue;
          }
          
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');
          const fileMatches = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            regex.lastIndex = 0; // Reset regex state
            const match = regex.exec(line);
            
            if (match) {
              if (totalMatches >= maxResults) {
                truncated = true;
                break;
              }
              
              const matchEntry = {
                line: i + 1,
                content: includeContent ? line.trim() : undefined,
                column: match.index
              };
              
              // Remove undefined content if not included
              if (!includeContent) {
                delete matchEntry.content;
              }
              
              fileMatches.push(matchEntry);
              totalMatches++;
            }
          }
          
          if (fileMatches.length > 0) {
            results.push({
              path: this._toRelativePath(file),
              matches: fileMatches
            });
          }
        } catch {
          // Skip files that can't be read (binary, permissions, etc.)
          continue;
        }
      }
      
      return {
        success: true,
        pattern,
        results,
        totalMatches,
        truncated
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        pattern,
        results: [],
        totalMatches: 0,
        truncated: false
      };
    }
  }

  /**
   * Gets all files in a directory recursively
   * @private
   * @param {string} dirPath - Directory path
   * @param {string} [filePattern] - Glob pattern filter
   * @returns {Promise<string[]>} Array of absolute file paths
   */
  async _getAllFiles(dirPath, filePattern) {
    const files = [];
    
    const processDir = async (currentPath, depth = 0) => {
      if (depth > DEFAULTS.maxDepth) return;
      
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          // Skip hidden files and common non-source directories
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' || 
              entry.name === 'dist' ||
              entry.name === 'build' ||
              entry.name === '.git') {
            continue;
          }
          
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            await processDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            if (!filePattern || this._matchGlob(entry.name, filePattern)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    };
    
    await processDir(dirPath);
    return files;
  }

  /**
   * Searches for files matching a glob pattern
   * @param {string} pattern - Glob pattern (e.g., "**\/*.ts", "src/**\/*.js")
   * @param {Object} [options={}] - Search options
   * @param {string} [options.basePath] - Base path to search in (default: allowedBasePath)
   * @param {number} [options.maxResults=100] - Maximum number of results
   * @returns {Promise<{success: boolean, error?: string, pattern: string, files: string[]}>}
   */
  async globSearch(pattern, options = {}) {
    const basePath = options.basePath 
      ? this.resolvePath(options.basePath) 
      : this.allowedBasePath;
    const maxResults = options.maxResults || DEFAULTS.maxResults;
    
    try {
      const files = [];
      
      // Parse the glob pattern
      const parts = pattern.split(/[/\\]+/);
      const isRecursive = parts.includes('**');
      const filePattern = parts[parts.length - 1];
      
      // Extract the directory prefix (everything before ** or the last segment)
      let searchDir = basePath;
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i] === '**') break;
        if (parts[i]) {
          searchDir = path.join(searchDir, parts[i]);
        }
      }
      
      // Validate the search directory
      if (!this.isPathAllowed(searchDir)) {
        return {
          success: false,
          error: 'Search path is outside allowed directory',
          pattern,
          files: []
        };
      }
      
      // Search for matching files
      const matchFiles = async (currentPath, depth = 0) => {
        if (files.length >= maxResults) return;
        if (depth > DEFAULTS.maxDepth) return;
        
        try {
          const entries = await fs.readdir(currentPath, { withFileTypes: true });
          
          for (const entry of entries) {
            if (files.length >= maxResults) break;
            
            // Skip hidden files and common non-source directories
            if (entry.name.startsWith('.') || 
                entry.name === 'node_modules' || 
                entry.name === '.git') {
              continue;
            }
            
            const fullPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
              if (isRecursive) {
                await matchFiles(fullPath, depth + 1);
              }
            } else if (entry.isFile()) {
              if (this._matchGlob(entry.name, filePattern)) {
                files.push(this._toRelativePath(fullPath));
              }
            }
          }
        } catch {
          // Skip directories that can't be read
        }
      };
      
      await matchFiles(searchDir);
      
      return {
        success: true,
        pattern,
        files
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        pattern,
        files: []
      };
    }
  }

  /**
   * Checks if a path exists
   * @param {string} checkPath - Path to check (relative or absolute)
   * @returns {Promise<boolean>} True if exists
   */
  async exists(checkPath) {
    try {
      const absolutePath = this.resolvePath(checkPath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets file or directory statistics
   * @param {string} filePath - Path to check (relative or absolute)
   * @returns {Promise<{exists: boolean, type?: 'file'|'directory'|'symlink', size?: number, modified?: Date, created?: Date}>}
   */
  async getStats(filePath) {
    try {
      const absolutePath = this.resolvePath(filePath);
      const stats = await fs.lstat(absolutePath);
      
      let type;
      if (stats.isSymbolicLink()) {
        type = 'symlink';
      } else if (stats.isDirectory()) {
        type = 'directory';
      } else if (stats.isFile()) {
        type = 'file';
      }
      
      return {
        exists: true,
        type,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime
      };
    } catch {
      return {
        exists: false
      };
    }
  }
}

/**
 * Singleton instance with default configuration
 * @type {FileManager}
 */
export const fileManager = new FileManager();

/**
 * Factory function to create a FileManager instance scoped to a specific project path.
 * This ensures all file operations are restricted to the project directory.
 * 
 * @param {string} projectPath - The base path for all operations (e.g., results/{taskId}/project/)
 * @returns {FileManager} A new FileManager instance scoped to the project path
 * 
 * @example
 * const scopedFM = createScopedFileManager('/path/to/results/task-123/project');
 * await scopedFM.writeFile('src/app.js', '// code'); // Creates at /path/to/results/task-123/project/src/app.js
 * await scopedFM.writeFile('../../../etc/passwd', ''); // Throws error - outside allowed path
 */
export function createScopedFileManager(projectPath) {
  return new FileManager({ allowedBasePath: projectPath });
}

/**
 * Get the results base path for creating scoped instances
 * @returns {string} The base path for results storage
 */
export function getResultsBasePath() {
  return RESULTS_BASE_PATH;
}

export default FileManager;
