import { BaseAgent } from './baseAgent.js';
import { VERIFIER_TOOLS } from './tools/definitions.js';
import { fileManager } from '../services/fileManager.js';
import { terminalService } from '../services/terminal.js';

/**
 * System prompt that instructs the Verifier Agent on its validation responsibilities
 * @constant {string}
 */
const VERIFIER_SYSTEM_PROMPT = `You are a Verifier Agent specialized in validating code and work quality.

Your job is to:
1. Review the files that were modified or created
2. Run relevant tests, linters, and type checkers
3. Check for common issues (syntax errors, missing imports, logic errors)
4. Report any issues found with appropriate severity
5. Provide an overall verdict: passed, failed, or needs_revision

Guidelines:
- Start by reading the modified/created files
- Check if the changes make sense in the context of the task
- Run the test suite if one exists (npm test, pytest, etc.)
- Run linters and type checkers if available (eslint, tsc, mypy, etc.)
- Look for common issues:
  * Syntax errors
  * Missing imports or dependencies
  * Unused variables or code
  * Security issues (hardcoded secrets, SQL injection, XSS)
  * Performance concerns (N+1 queries, memory leaks)
  * Missing error handling
  * Inconsistent naming conventions
  * Missing or outdated documentation

Project type detection:
- Node.js: Look for package.json, run "npm test", "npm run lint", "npx tsc --noEmit"
- Python: Look for requirements.txt/pyproject.toml, run "pytest", "mypy", "flake8"
- Go: Look for go.mod, run "go test ./...", "go vet ./..."
- Rust: Look for Cargo.toml, run "cargo test", "cargo clippy"

Severity levels:
- error: Must be fixed, blocks acceptance (syntax errors, failing tests, security issues)
- warning: Should be fixed, but not blocking (missing error handling, potential bugs)
- suggestion: Nice to have improvement (code style, documentation, refactoring)

When you've completed verification, use the report_issues tool with your findings.`;

/**
 * Common patterns to check for potential issues
 * @constant {Object}
 */
const ISSUE_PATTERNS = {
  javascript: {
    consoleLog: /console\.(log|debug|info)\(/g,
    todoComments: /\/\/\s*(TODO|FIXME|HACK|XXX):/gi,
    hardcodedSecrets: /(password|secret|api_?key|token)\s*[:=]\s*['"][^'"]+['"]/gi,
    emptyBlocks: /\{\s*\}/g,
    debugger: /\bdebugger\b/g
  },
  python: {
    printStatements: /\bprint\s*\(/g,
    todoComments: /#\s*(TODO|FIXME|HACK|XXX):/gi,
    hardcodedSecrets: /(password|secret|api_?key|token)\s*=\s*['"][^'"]+['"]/gi,
    bareExcept: /except\s*:/g
  }
};

/**
 * VerifierAgent validates work done by other agents
 * 
 * This agent specializes in code review, running tests, and identifying
 * potential issues in modified or created files. It provides structured
 * feedback with severity levels and an overall pass/fail verdict.
 * 
 * @extends BaseAgent
 * 
 * @example
 * const verifier = new VerifierAgent({
 *   apiKey: 'your-api-key',
 *   filesModified: ['src/utils.js'],
 *   filesCreated: ['src/newFeature.js'],
 *   taskDescription: 'Add user authentication',
 *   projectPath: '/path/to/project'
 * });
 * 
 * const result = await verifier.verify();
 * if (result.passed) {
 *   console.log('Verification passed!');
 * } else {
 *   console.log('Issues found:', result.issues);
 * }
 */
export class VerifierAgent extends BaseAgent {
  /**
   * Creates a new VerifierAgent instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - API key for the LLM provider
   * @param {Array<string>} [options.filesModified=[]] - Paths of files that were modified
   * @param {Array<string>} [options.filesCreated=[]] - Paths of files that were created
   * @param {string} [options.taskDescription=''] - Description of the original task being verified
   * @param {string} [options.projectPath=''] - Root path of the project for running commands
   * @param {string} [options.model] - LLM model to use
   * @param {number} [options.maxIterations=15] - Maximum verification iterations
   */
  constructor(options) {
    const {
      filesModified = [],
      filesCreated = [],
      taskDescription = '',
      projectPath = '',
      ...baseOptions
    } = options;
    
    /**
     * Tool executors for verification operations
     * @type {Object.<string, Function>}
     */
    const toolExecutors = {
      /**
       * Reads the contents of a file for review
       * @param {Object} args - Tool arguments
       * @param {string} args.path - Path to the file to read
       * @param {string} [args.encoding='utf-8'] - File encoding
       * @returns {Promise<Object>} File contents and metadata
       */
      read_file: async (args) => {
        const result = await fileManager.readFile(args.path, {
          encoding: args.encoding || 'utf-8'
        });
        return result;
      },
      
      /**
       * Searches the codebase for patterns (useful for finding usages, imports, etc.)
       * @param {Object} args - Tool arguments
       * @param {string} args.pattern - Search pattern (regex supported)
       * @param {string} [args.path] - Base path to search in
       * @param {string} [args.file_pattern] - Glob pattern for files to search
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
       * Executes terminal commands for running tests, linters, etc.
       * @param {Object} args - Tool arguments
       * @param {string} args.command - Command to execute
       * @param {string} [args.working_directory] - Working directory for command
       * @param {number} [args.timeout_ms=60000] - Command timeout in milliseconds
       * @returns {Promise<Object>} Command execution result
       */
      run_terminal: async (args) => {
        const result = await terminalService.execute(args.command, {
          workingDirectory: args.working_directory || projectPath,
          timeout: args.timeout_ms || 60000  // Longer timeout for tests
        });
        return {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      },
      
      /**
       * Reports verification issues - this is the terminal tool that completes verification
       * @param {Object} args - Tool arguments
       * @param {Array<Object>} [args.issues=[]] - List of issues found
       * @param {string} args.issues[].file - File where issue was found
       * @param {number} [args.issues[].line] - Line number of the issue
       * @param {string} args.issues[].severity - Issue severity (error|warning|suggestion)
       * @param {string} args.issues[].message - Description of the issue
       * @param {string} [args.issues[].code] - Issue code/identifier
       * @param {string} args.overall_status - Overall status (passed|failed|needs_revision)
       * @param {string} args.summary - Human-readable summary of verification
       * @returns {Object} Structured verification result
       */
      report_issues: async (args) => {
        const issues = args.issues || [];
        const errorCount = issues.filter(i => i.severity === 'error').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;
        const suggestionCount = issues.filter(i => i.severity === 'suggestion').length;
        
        return {
          issues,
          overallStatus: args.overall_status,
          summary: args.summary,
          passed: args.overall_status === 'passed',
          errorCount,
          warningCount,
          suggestionCount,
          metrics: {
            totalIssues: issues.length,
            byFile: groupIssuesByFile(issues),
            bySeverity: { error: errorCount, warning: warningCount, suggestion: suggestionCount }
          }
        };
      }
    };
    
    super({
      ...baseOptions,
      role: 'verifier',
      systemPrompt: VERIFIER_SYSTEM_PROMPT,
      tools: VERIFIER_TOOLS,
      toolExecutors,
      maxIterations: baseOptions.maxIterations || 15
    });
    
    /**
     * Files that were modified and need verification
     * @type {Array<string>}
     */
    this.filesModified = filesModified;
    
    /**
     * Files that were created and need verification
     * @type {Array<string>}
     */
    this.filesCreated = filesCreated;
    
    /**
     * Description of the original task
     * @type {string}
     */
    this.taskDescription = taskDescription;
    
    /**
     * Root project path for running commands
     * @type {string}
     */
    this.projectPath = projectPath;
    
    /**
     * Detected project type based on configuration files
     * @type {string|null}
     */
    this.projectType = null;
  }
  
  /**
   * Detects the project type by checking for configuration files
   * 
   * @returns {Promise<string>} Detected project type (nodejs|python|go|rust|unknown)
   * @private
   */
  async detectProjectType() {
    if (this.projectType) {
      return this.projectType;
    }
    
    const checks = [
      { file: 'package.json', type: 'nodejs' },
      { file: 'requirements.txt', type: 'python' },
      { file: 'pyproject.toml', type: 'python' },
      { file: 'setup.py', type: 'python' },
      { file: 'go.mod', type: 'go' },
      { file: 'Cargo.toml', type: 'rust' }
    ];
    
    for (const check of checks) {
      try {
        const filePath = this.projectPath 
          ? `${this.projectPath}/${check.file}` 
          : check.file;
        const result = await fileManager.readFile(filePath);
        if (result.success) {
          this.projectType = check.type;
          return this.projectType;
        }
      } catch {
        // File doesn't exist, continue checking
      }
    }
    
    this.projectType = 'unknown';
    return this.projectType;
  }
  
  /**
   * Gets recommended verification commands based on project type
   * 
   * @returns {Promise<Object>} Object containing test, lint, and typecheck commands
   * @private
   */
  async getVerificationCommands() {
    const projectType = await this.detectProjectType();
    
    const commands = {
      nodejs: {
        test: 'npm test',
        lint: 'npm run lint',
        typecheck: 'npx tsc --noEmit'
      },
      python: {
        test: 'pytest',
        lint: 'flake8',
        typecheck: 'mypy .'
      },
      go: {
        test: 'go test ./...',
        lint: 'go vet ./...',
        typecheck: null // Go compiles and checks types together
      },
      rust: {
        test: 'cargo test',
        lint: 'cargo clippy',
        typecheck: null // Rust compiles and checks types together
      },
      unknown: {
        test: null,
        lint: null,
        typecheck: null
      }
    };
    
    return commands[projectType] || commands.unknown;
  }
  
  /**
   * Verifies the work done by another agent
   * 
   * This method:
   * 1. Builds a verification request with file lists and task context
   * 2. Runs the agent loop to analyze files, run tests, and check for issues
   * 3. Returns a structured result with pass/fail verdict and issue details
   * 
   * @returns {Promise<VerificationResult>} Verification result object
   * 
   * @typedef {Object} VerificationResult
   * @property {boolean} passed - Whether verification passed
   * @property {string} overallStatus - Status: 'passed', 'failed', or 'needs_revision'
   * @property {Array<Issue>} issues - List of issues found
   * @property {string} summary - Human-readable summary
   * @property {number} errorCount - Number of error-level issues
   * @property {number} warningCount - Number of warning-level issues
   * @property {number} suggestionCount - Number of suggestion-level issues
   * @property {number} iterations - Number of agent iterations used
   * @property {number} duration - Time taken in milliseconds
   * 
   * @typedef {Object} Issue
   * @property {string} file - File path where issue was found
   * @property {number} [line] - Line number
   * @property {string} severity - 'error', 'warning', or 'suggestion'
   * @property {string} message - Issue description
   * @property {string} [code] - Issue code/identifier
   */
  async verify() {
    // Detect project type for context
    const projectType = await this.detectProjectType();
    const commands = await this.getVerificationCommands();
    
    // Build the verification message
    let message = `## Verification Task\n\n`;
    message += `**Original task:** ${this.taskDescription}\n\n`;
    message += `**Detected project type:** ${projectType}\n\n`;
    
    if (this.filesModified.length > 0) {
      message += `### Files Modified\n`;
      message += this.filesModified.map(f => `- \`${f}\``).join('\n');
      message += '\n\n';
    }
    
    if (this.filesCreated.length > 0) {
      message += `### Files Created\n`;
      message += this.filesCreated.map(f => `- \`${f}\``).join('\n');
      message += '\n\n';
    }
    
    if (this.projectPath) {
      message += `**Project path:** \`${this.projectPath}\`\n\n`;
    }
    
    // Add available verification commands
    message += `### Available Verification Commands\n`;
    if (commands.test) message += `- Test: \`${commands.test}\`\n`;
    if (commands.lint) message += `- Lint: \`${commands.lint}\`\n`;
    if (commands.typecheck) message += `- Type check: \`${commands.typecheck}\`\n`;
    message += '\n';
    
    message += `### Verification Checklist\n`;
    message += `1. Read and review all modified/created files\n`;
    message += `2. Check for syntax errors and missing imports\n`;
    message += `3. Run tests if available\n`;
    message += `4. Run linters if available\n`;
    message += `5. Check for security issues (hardcoded secrets, injection vulnerabilities)\n`;
    message += `6. Verify error handling is appropriate\n`;
    message += `7. Report all findings using report_issues\n\n`;
    
    message += `Please verify the work and report any issues found.`;
    
    // Run the verification
    const result = await this.run(message);
    
    // Extract verification result from the final tool call
    if (result.finalToolResult) {
      return {
        passed: result.finalToolResult.passed,
        overallStatus: result.finalToolResult.overallStatus,
        issues: result.finalToolResult.issues || [],
        summary: result.finalToolResult.summary,
        errorCount: result.finalToolResult.errorCount || 0,
        warningCount: result.finalToolResult.warningCount || 0,
        suggestionCount: result.finalToolResult.suggestionCount || 0,
        metrics: result.finalToolResult.metrics,
        iterations: result.iterations,
        duration: result.duration,
        projectType
      };
    }
    
    // Fallback if no structured result (shouldn't happen normally)
    return {
      passed: false,
      overallStatus: 'unknown',
      issues: [],
      summary: result.content || 'Verification completed without structured result',
      errorCount: 0,
      warningCount: 0,
      suggestionCount: 0,
      iterations: result.iterations,
      duration: result.duration,
      projectType
    };
  }
  
  /**
   * Performs a quick static analysis on a file content
   * 
   * This is a helper method that can be used for fast pattern-based checks
   * without invoking the LLM.
   * 
   * @param {string} content - File content to analyze
   * @param {string} fileType - Type of file (javascript|python|etc.)
   * @returns {Array<Object>} List of potential issues found
   * @static
   */
  static quickStaticAnalysis(content, fileType) {
    const issues = [];
    const patterns = ISSUE_PATTERNS[fileType] || {};
    
    const lines = content.split('\n');
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      // Reset regex state
      regex.lastIndex = 0;
      
      lines.forEach((line, index) => {
        regex.lastIndex = 0;
        if (regex.test(line)) {
          issues.push({
            line: index + 1,
            type: patternName,
            severity: getSeverityForPattern(patternName),
            message: getMessageForPattern(patternName),
            snippet: line.trim()
          });
        }
      });
    }
    
    return issues;
  }
}

/**
 * Groups issues by file path for easier reporting
 * 
 * @param {Array<Object>} issues - List of issues
 * @returns {Object.<string, Array<Object>>} Issues grouped by file path
 * @private
 */
function groupIssuesByFile(issues) {
  return issues.reduce((acc, issue) => {
    const file = issue.file || 'unknown';
    if (!acc[file]) {
      acc[file] = [];
    }
    acc[file].push(issue);
    return acc;
  }, {});
}

/**
 * Gets the severity level for a pattern match
 * 
 * @param {string} patternName - Name of the matched pattern
 * @returns {string} Severity level (error|warning|suggestion)
 * @private
 */
function getSeverityForPattern(patternName) {
  const severityMap = {
    hardcodedSecrets: 'error',
    debugger: 'error',
    bareExcept: 'warning',
    consoleLog: 'warning',
    printStatements: 'warning',
    emptyBlocks: 'warning',
    todoComments: 'suggestion'
  };
  return severityMap[patternName] || 'suggestion';
}

/**
 * Gets a human-readable message for a pattern match
 * 
 * @param {string} patternName - Name of the matched pattern
 * @returns {string} Human-readable issue description
 * @private
 */
function getMessageForPattern(patternName) {
  const messageMap = {
    hardcodedSecrets: 'Potential hardcoded secret or credential detected',
    debugger: 'Debugger statement found - should be removed',
    bareExcept: 'Bare except clause - should specify exception type',
    consoleLog: 'Console log statement - consider removing for production',
    printStatements: 'Print statement - consider using logging module',
    emptyBlocks: 'Empty code block detected',
    todoComments: 'TODO/FIXME comment found - may need attention'
  };
  return messageMap[patternName] || 'Potential issue detected';
}

/**
 * Factory function to verify work done by an agent
 * 
 * This is a convenience function that creates a VerifierAgent and runs
 * verification in a single call.
 * 
 * @param {string} apiKey - API key for the LLM provider
 * @param {Object} options - Verification options
 * @param {Array<string>} [options.filesModified] - Paths of modified files
 * @param {Array<string>} [options.filesCreated] - Paths of created files
 * @param {string} [options.taskDescription] - Original task description
 * @param {string} [options.projectPath] - Root project path
 * @param {string} [options.model] - LLM model to use
 * @returns {Promise<VerificationResult>} Verification result
 * 
 * @example
 * const result = await verifyWork('api-key', {
 *   filesModified: ['src/auth.js'],
 *   filesCreated: ['src/auth.test.js'],
 *   taskDescription: 'Add JWT authentication',
 *   projectPath: '/projects/myapp'
 * });
 * 
 * console.log(`Verification ${result.passed ? 'PASSED' : 'FAILED'}`);
 * console.log(`Found ${result.errorCount} errors, ${result.warningCount} warnings`);
 */
export async function verifyWork(apiKey, options) {
  const agent = new VerifierAgent({
    apiKey,
    ...options
  });
  
  return await agent.verify();
}

export { ISSUE_PATTERNS };
