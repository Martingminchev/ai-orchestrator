/**
 * Improvements Agent - Deep research and analysis agent
 * 
 * This agent specializes in thorough research and analysis of specific topics,
 * patterns, or implementations within a codebase. It identifies potential
 * improvements, optimizations, and alternatives with actionable recommendations.
 * 
 * @module agents/improvementsAgent
 */

import { BaseAgent } from './baseAgent.js';
import { IMPROVEMENTS_AGENT_TOOLS } from './tools/definitions.js';
import { fileManager } from '../services/fileManager.js';

// Content size limits to prevent exceeding API message limits
const MAX_FILE_CONTENT_SIZE = 200 * 1024; // 200KB max for file content in responses
const MAX_TOTAL_ANALYZE_SIZE = 500 * 1024; // 500KB total for analyze_code tool

/**
 * System prompt that defines the Improvements Agent's behavior and guidelines
 * @constant {string}
 */
const IMPROVEMENTS_SYSTEM_PROMPT = `You are an Improvements Agent specialized in deep research and analysis.

Your job is to:
1. Research a specific topic, pattern, or implementation in depth
2. Analyze existing code to understand current approaches
3. Identify potential improvements, optimizations, or alternatives
4. Document your findings with actionable recommendations

Guidelines:
- Be thorough - explore multiple angles and approaches
- Look at actual code to understand how things are implemented
- Consider trade-offs of different approaches
- Research best practices and patterns
- Provide concrete, actionable recommendations
- Include code examples where helpful

Analysis areas might include:
- Performance optimization opportunities
- Code quality and maintainability improvements
- Security considerations
- Scalability concerns
- Testing coverage gaps
- Architecture patterns
- Dependency updates or alternatives

When done, use the document_findings tool with your detailed research.`;

/**
 * ImprovementsAgent performs deep research and analysis on specific topics
 * within a codebase. It can read files, search for patterns, analyze code,
 * and document detailed findings with actionable recommendations.
 * 
 * @extends BaseAgent
 * 
 * @example
 * const agent = new ImprovementsAgent({
 *   apiKey: 'your-api-key',
 *   topic: 'Error handling patterns',
 *   depth: 'deep',
 *   focusAreas: ['consistency', 'user feedback', 'logging'],
 *   projectPath: '/path/to/project'
 * });
 * 
 * const results = await agent.research();
 * console.log(results.findings);
 * console.log(results.recommendations);
 */
export class ImprovementsAgent extends BaseAgent {
  /**
   * Creates a new ImprovementsAgent instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - API key for the LLM provider
   * @param {string} [options.topic=''] - The topic to research and analyze
   * @param {('shallow'|'medium'|'deep')} [options.depth='medium'] - Research depth level
   *   - 'shallow': Quick analysis focusing on obvious findings
   *   - 'medium': Standard analysis covering main areas
   *   - 'deep': Thorough analysis with edge cases and detailed examples
   * @param {Array<string>} [options.focusAreas=[]] - Specific areas to focus the research on
   * @param {string} [options.projectPath=''] - Root path of the project to analyze
   * @param {string} [options.model] - LLM model to use (inherited from BaseAgent)
   * @param {number} [options.maxIterations] - Maximum tool call iterations (inherited from BaseAgent)
   */
  constructor(options) {
    const {
      topic = '',
      depth = 'medium',
      focusAreas = [],
      projectPath = '',
      ...baseOptions
    } = options;
    
    /**
     * Tool executors for the Improvements Agent
     * @type {Object.<string, Function>}
     */
    const toolExecutors = {
      /**
       * Reads the contents of a file
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Path to the file to read
       * @param {string} [args.encoding='utf-8'] - File encoding
       * @returns {Promise<Object>} File content and metadata
       */
      read_file: async (args) => {
        const result = await fileManager.readFile(args.path, {
          encoding: args.encoding
        });
        
        // Truncate content if it exceeds safe size for API
        if (result.success && result.content && result.content.length > MAX_FILE_CONTENT_SIZE) {
          const originalSize = result.content.length;
          result.content = result.content.substring(0, MAX_FILE_CONTENT_SIZE) +
            `\n\n... [TRUNCATED: File is ${Math.round(originalSize/1024)}KB, showing first ${Math.round(MAX_FILE_CONTENT_SIZE/1024)}KB]`;
          result.truncated = true;
          result.originalSize = originalSize;
        }
        
        return result;
      },
      
      /**
       * Searches the codebase for patterns using regex or text matching
       * @param {Object} args - Tool arguments
       * @param {string} args.pattern - Search pattern (regex supported)
       * @param {string} [args.path] - Base path to search from
       * @param {string} [args.file_pattern] - Glob pattern to filter files
       * @returns {Promise<Object>} Search results with file paths and matches
       */
      search_codebase: async (args) => {
        const result = await fileManager.searchFiles(args.pattern, {
          basePath: args.path,
          filePattern: args.file_pattern,
          maxResults: 100  // More results for deep research
        });
        return result;
      },
      
      /**
       * Lists contents of a directory
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Directory path to list
       * @param {boolean} [args.recursive=false] - Whether to list recursively
       * @param {number} [args.max_depth] - Maximum depth for recursive listing
       * @returns {Promise<Object>} Directory listing with file/folder information
       */
      list_directory: async (args) => {
        const result = await fileManager.listDirectory(args.path, {
          recursive: args.recursive,
          maxDepth: args.max_depth
        });
        return result;
      },
      
      /**
       * Performs deep analysis on multiple code files
       * @param {Object} args - Tool arguments
       * @param {Array<string>} args.paths - Array of file paths to analyze
       * @param {string} [args.focus] - Specific aspect to focus analysis on
       * @returns {Promise<Object>} Analysis results for each file
       */
      analyze_code: async (args) => {
        const analyses = [];
        let totalSize = 0;
        
        for (const filePath of args.paths) {
          // Check if we've hit total budget
          if (totalSize >= MAX_TOTAL_ANALYZE_SIZE) {
            analyses.push({
              path: filePath,
              content: null,
              skipped: true,
              reason: 'Total analysis size budget reached'
            });
            continue;
          }
          
          const content = await fileManager.readFile(filePath);
          if (content.success) {
            let fileContent = content.content;
            let truncated = false;
            
            // Truncate individual file if too large
            if (fileContent && fileContent.length > MAX_FILE_CONTENT_SIZE) {
              fileContent = fileContent.substring(0, MAX_FILE_CONTENT_SIZE) +
                `\n\n... [TRUNCATED: File is ${Math.round(content.content.length/1024)}KB]`;
              truncated = true;
            }
            
            // Check remaining budget
            const remainingBudget = MAX_TOTAL_ANALYZE_SIZE - totalSize;
            if (fileContent && fileContent.length > remainingBudget) {
              fileContent = fileContent.substring(0, remainingBudget) +
                `\n\n... [TRUNCATED: Analysis budget reached]`;
              truncated = true;
            }
            
            totalSize += fileContent ? fileContent.length : 0;
            
            analyses.push({
              path: filePath,
              content: fileContent,
              size: content.metadata.size,
              truncated,
              focus: args.focus
            });
          }
        }
        
        return {
          analyzedFiles: analyses.filter(a => !a.skipped).length,
          skippedFiles: analyses.filter(a => a.skipped).length,
          totalSize,
          files: analyses
        };
      },
      
      /**
       * Documents research findings - terminal tool that completes the research
       * @param {Object} args - Tool arguments
       * @param {string} args.topic - The research topic
       * @param {Array<Object>} [args.findings=[]] - Array of finding objects
       * @param {string} args.findings[].area - Area of the finding
       * @param {string} args.findings[].description - Detailed description
       * @param {string} args.findings[].severity - Impact level (low/medium/high)
       * @param {Array<string>} args.findings[].recommendations - Actionable recommendations
       * @param {string} [args.findings[].codeExample] - Optional code example
       * @param {string} args.summary - Executive summary of findings
       * @returns {Promise<Object>} Structured research results
       */
      document_findings: async (args) => {
        return {
          topic: args.topic,
          findings: args.findings || [],
          summary: args.summary,
          totalFindings: args.findings?.length || 0,
          recommendations: args.findings?.flatMap(f => f.recommendations || []) || []
        };
      }
    };
    
    super({
      ...baseOptions,
      role: 'improvements',
      systemPrompt: IMPROVEMENTS_SYSTEM_PROMPT,
      tools: IMPROVEMENTS_AGENT_TOOLS,
      toolExecutors
    });
    
    /**
     * The topic being researched
     * @type {string}
     */
    this.topic = topic;
    
    /**
     * Research depth level
     * @type {('shallow'|'medium'|'deep')}
     */
    this.depth = depth;
    
    /**
     * Specific areas to focus the research on
     * @type {Array<string>}
     */
    this.focusAreas = focusAreas;
    
    /**
     * Root path of the project being analyzed
     * @type {string}
     */
    this.projectPath = projectPath;
  }
  
  /**
   * Executes the research task based on configured topic and parameters
   * 
   * This method constructs a research prompt based on the topic, depth, and
   * focus areas, then runs the agent to perform the analysis. The agent will
   * use its tools to explore the codebase and document findings.
   * 
   * @returns {Promise<ResearchResult>} Research results
   * 
   * @typedef {Object} ResearchResult
   * @property {string} topic - The researched topic
   * @property {Array<Finding>} findings - Array of detailed findings
   * @property {string} summary - Executive summary of the research
   * @property {Array<string>} recommendations - Flattened list of all recommendations
   * @property {number} iterations - Number of tool call iterations performed
   * @property {number} duration - Total research duration in milliseconds
   * 
   * @typedef {Object} Finding
   * @property {string} area - Area or category of the finding
   * @property {string} description - Detailed description of the finding
   * @property {string} severity - Impact level: 'low', 'medium', or 'high'
   * @property {Array<string>} recommendations - Actionable recommendations
   * @property {string} [codeExample] - Optional code example demonstrating the improvement
   * 
   * @example
   * const agent = new ImprovementsAgent({
   *   apiKey: 'key',
   *   topic: 'Authentication security',
   *   depth: 'deep',
   *   focusAreas: ['token handling', 'session management'],
   *   projectPath: '/app'
   * });
   * 
   * const result = await agent.research();
   * 
   * // Process findings by severity
   * const highPriority = result.findings.filter(f => f.severity === 'high');
   * console.log(`Found ${highPriority.length} high-priority issues`);
   * 
   * // Get all recommendations
   * result.recommendations.forEach(rec => console.log(`- ${rec}`));
   */
  async research() {
    console.log(`\n[ImprovementsAgent] ===== STARTING RESEARCH =====`);
    console.log(`[ImprovementsAgent] Topic: ${this.topic}`);
    console.log(`[ImprovementsAgent] Depth: ${this.depth}`);
    console.log(`[ImprovementsAgent] Focus areas: ${this.focusAreas.join(', ') || 'none'}`);
    console.log(`[ImprovementsAgent] Project path: ${this.projectPath || 'not specified'}`);
    
    let message = `## Research Task\n\n`;
    message += `Topic: ${this.topic}\n`;
    message += `Depth: ${this.depth}\n\n`;
    
    if (this.focusAreas.length > 0) {
      message += `Focus areas:\n`;
      message += this.focusAreas.map(a => `- ${a}`).join('\n');
      message += '\n\n';
    }
    
    if (this.projectPath) {
      message += `Project path: ${this.projectPath}\n\n`;
    }
    
    // Adjust instructions based on depth parameter
    switch (this.depth) {
      case 'shallow':
        message += `This is a quick analysis. Focus on the most obvious findings and key recommendations. `;
        message += `Limit exploration to 3-5 files and provide 2-3 main findings.`;
        break;
      case 'deep':
        message += `This is a deep analysis. Be thorough, explore edge cases, and provide detailed recommendations with code examples. `;
        message += `Analyze as many relevant files as needed, consider multiple approaches, and include specific code snippets in your recommendations. `;
        message += `Document at least 5-10 findings across different areas.`;
        break;
      default: // 'medium'
        message += `This is a standard analysis. Cover the main areas and provide actionable recommendations. `;
        message += `Analyze 5-10 relevant files and provide 3-5 well-documented findings.`;
    }
    
    const result = await this.run(message);
    
    console.log(`[ImprovementsAgent] ===== RESEARCH COMPLETE =====`);
    console.log(`[ImprovementsAgent] Iterations: ${result.iterations}`);
    console.log(`[ImprovementsAgent] Duration: ${result.duration}ms`);
    console.log(`[ImprovementsAgent] Tools used: ${result.toolsUsed?.map(t => t.name).join(', ') || 'none'}`);
    
    // Extract structured research result from the document_findings tool
    if (result.finalToolResult) {
      return {
        topic: result.finalToolResult.topic,
        findings: result.finalToolResult.findings || [],
        summary: result.finalToolResult.summary,
        recommendations: result.finalToolResult.recommendations || [],
        iterations: result.iterations,
        duration: result.duration
      };
    }
    
    // Fallback if no structured result from document_findings
    return {
      topic: this.topic,
      findings: [],
      summary: result.content,
      recommendations: [],
      iterations: result.iterations,
      duration: result.duration
    };
  }
}

/**
 * Factory function to quickly research a topic without manually instantiating the agent
 * 
 * @param {string} apiKey - API key for the LLM provider
 * @param {Object} options - Research configuration options
 * @param {string} options.topic - The topic to research
 * @param {('shallow'|'medium'|'deep')} [options.depth='medium'] - Research depth
 * @param {Array<string>} [options.focusAreas=[]] - Specific areas to focus on
 * @param {string} [options.projectPath=''] - Root project path
 * @param {string} [options.model] - LLM model to use
 * @param {number} [options.maxIterations] - Maximum iterations
 * @returns {Promise<ResearchResult>} Research results
 * 
 * @example
 * // Quick shallow analysis
 * const quickResults = await researchTopic('api-key', {
 *   topic: 'API response formats',
 *   depth: 'shallow',
 *   projectPath: '/my/project'
 * });
 * 
 * @example
 * // Deep analysis with focus areas
 * const deepResults = await researchTopic('api-key', {
 *   topic: 'Database query optimization',
 *   depth: 'deep',
 *   focusAreas: ['N+1 queries', 'indexing', 'connection pooling'],
 *   projectPath: '/my/project'
 * });
 * 
 * console.log(`Found ${deepResults.findings.length} areas for improvement`);
 * console.log(`Summary: ${deepResults.summary}`);
 */
export async function researchTopic(apiKey, options) {
  const agent = new ImprovementsAgent({
    apiKey,
    ...options
  });
  
  return await agent.research();
}
