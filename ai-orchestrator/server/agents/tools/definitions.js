/**
 * @fileoverview OpenAI-compatible tool schemas for the orchestration system.
 * Defines all tool definitions for various agent types.
 */

// =============================================================================
// SHARED TOOL DEFINITIONS (reused across multiple agent types)
// =============================================================================

/**
 * Read file contents tool definition
 * @type {Object}
 */
const readFileTool = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute or relative path to the file to read'
        },
        encoding: {
          type: 'string',
          description: 'The encoding to use when reading the file',
          default: 'utf-8'
        }
      },
      required: ['path']
    }
  }
};

/**
 * Search codebase tool definition
 * @type {Object}
 */
const searchCodebaseTool = {
  type: 'function',
  function: {
    name: 'search_codebase',
    description: 'Search for patterns in files using regex. Returns matching files and line numbers.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for'
        },
        path: {
          type: 'string',
          description: 'Directory path to search in. Defaults to project root if not specified.'
        },
        file_pattern: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}")'
        }
      },
      required: ['pattern']
    }
  }
};

/**
 * List directory contents tool definition
 * @type {Object}
 */
const listDirectoryTool = {
  type: 'function',
  function: {
    name: 'list_directory',
    description: 'List the contents of a directory',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the directory to list'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list contents recursively',
          default: false
        },
        max_depth: {
          type: 'number',
          description: 'Maximum depth for recursive listing'
        }
      },
      required: ['path']
    }
  }
};

/**
 * Run terminal command tool definition
 * @type {Object}
 */
const runTerminalTool = {
  type: 'function',
  function: {
    name: 'run_terminal',
    description: 'Execute a shell command in the terminal. Use with caution.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        working_directory: {
          type: 'string',
          description: 'The working directory to run the command in. Must be within allowed scope.'
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds before the command is killed',
          default: 30000
        }
      },
      required: ['command']
    }
  }
};

// =============================================================================
// ORCHESTRATOR_TOOLS - Lean coordinator that only delegates work
// =============================================================================

/**
 * Tools available to the Orchestrator agent.
 * The Orchestrator never does work directly - it only delegates to specialized agents.
 * @type {Object[]}
 */
export const ORCHESTRATOR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'request_work',
      description: 'PRIMARY TOOL - Delegate any coding/building task to a worker agent. Use this FIRST for any task involving creating, building, modifying, or implementing code. Workers are smart and will figure out the details.',
      parameters: {
        type: 'object',
        properties: {
          expertise: {
            type: 'string',
            description: 'The type of expertise required (e.g., "Frontend developer", "React developer", "Backend engineer", "Full-stack developer")'
          },
          task: {
            type: 'string',
            description: 'What needs to be built or created - be specific about the goal'
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Priority level for this work request'
          },
          context_hints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional hints about what files or areas are relevant to this task'
          }
        },
        required: ['expertise', 'task', 'priority']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_improvement',
      description: 'RARELY USED: Analyze EXISTING code for quality/performance issues. Do NOT use this for understanding what to build - use request_work instead. Only use this for auditing existing codebases.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The aspect of existing code to analyze (e.g., "performance of database queries", "security of authentication")'
          },
          depth: {
            type: 'string',
            enum: ['shallow', 'medium', 'deep'],
            description: 'How thorough the analysis should be'
          },
          focus_areas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific areas of the existing code to focus on'
          }
        },
        required: ['topic', 'depth']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_supervision',
      description: 'Request review and cleanup of completed work. Use after agents have finished their tasks.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            description: 'What areas or aspects to review'
          },
          agent_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of agents whose work should be reviewed'
          }
        },
        required: ['scope', 'agent_ids']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'call_user',
      description: 'Ask the user a question or report progress. This is a blocking call that waits for user response.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to display to the user'
          },
          expect_response: {
            type: 'boolean',
            description: 'Whether to wait for a user response',
            default: true
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of choices to present to the user'
          },
          type: {
            type: 'string',
            enum: ['question', 'report', 'confirmation'],
            description: 'The type of user interaction'
          }
        },
        required: ['message', 'type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_agent',
      description: 'Ask a completed agent for clarification about their work',
      parameters: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'The ID of the agent to query'
          },
          question: {
            type: 'string',
            description: 'The question to ask the agent'
          }
        },
        required: ['agent_id', 'question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_extended_summary',
      description: 'Request a detailed summary of completed work when the brief summary is insufficient. Use sparingly - only when you need more details about specific aspects of completed work.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'ID of the worker whose work you want more details about'
          },
          aspects: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific aspects to elaborate on (e.g., "architecture decisions", "error handling approach", "testing strategy")'
          }
        },
        required: ['agent_id', 'aspects']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark the current task as complete and provide a summary',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A summary of what was accomplished'
          },
          deliverables: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to output files or deliverables'
          }
        },
        required: ['summary', 'deliverables']
      }
    }
  }
];

// =============================================================================
// WORKER_TOOLS - Full toolset for agents that do actual work
// =============================================================================

/**
 * Tools available to Worker agents.
 * Workers have full access to file system and terminal operations.
 * @type {Object[]}
 */
export const WORKER_TOOLS = [
  runTerminalTool,
  readFileTool,
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or create a file with the specified content',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path where the file should be written'
          },
          content: {
            type: 'string',
            description: 'The content to write to the file'
          },
          create_directories: {
            type: 'boolean',
            description: 'Whether to create parent directories if they do not exist',
            default: true
          }
        },
        required: ['path', 'content']
      }
    }
  },
  searchCodebaseTool,
  listDirectoryTool,
  {
    type: 'function',
    function: {
      name: 'report_progress',
      description: 'Update the orchestrator on current status',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['working', 'blocked', 'needs_input', 'completed'],
            description: 'Current work status'
          },
          message: {
            type: 'string',
            description: 'Description of current progress or blockers'
          },
          percentage: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Optional completion percentage (0-100)'
          }
        },
        required: ['status', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_context',
      description: 'Request additional files or context needed to complete the task',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'What additional context is needed and why'
          },
          suggested_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of file paths that might contain the needed context'
          }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_complete',
      description: 'Signal that the assigned work is done',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Summary of the work completed'
          },
          files_modified: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of files that were modified'
          },
          files_created: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of new files that were created'
          }
        },
        required: ['summary', 'files_modified', 'files_created']
      }
    }
  }
];

// =============================================================================
// CONTEXT_AGENT_TOOLS - For finding relevant files and context
// =============================================================================

/**
 * Tools available to Context agents.
 * Context agents find and select relevant files for other agents.
 * @type {Object[]}
 */
export const CONTEXT_AGENT_TOOLS = [
  searchCodebaseTool,
  readFileTool,
  listDirectoryTool,
  {
    type: 'function',
    function: {
      name: 'select_files',
      description: 'Mark files as relevant for the current task context',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Path to the relevant file'
                },
                relevance: {
                  type: 'string',
                  description: 'Explanation of why this file is relevant'
                }
              },
              required: ['path', 'relevance']
            },
            description: 'Array of files to include in context'
          },
          summary: {
            type: 'string',
            description: 'Overall summary of the selected context'
          }
        },
        required: ['files', 'summary']
      }
    }
  }
];

// =============================================================================
// VERIFIER_TOOLS - For validating work
// =============================================================================

/**
 * Tools available to Verifier agents.
 * Verifiers check work quality and report issues.
 * @type {Object[]}
 */
export const VERIFIER_TOOLS = [
  readFileTool,
  searchCodebaseTool,
  runTerminalTool,
  {
    type: 'function',
    function: {
      name: 'report_issues',
      description: 'Report validation issues found during verification',
      parameters: {
        type: 'object',
        properties: {
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                severity: {
                  type: 'string',
                  enum: ['error', 'warning', 'suggestion'],
                  description: 'How severe the issue is'
                },
                file: {
                  type: 'string',
                  description: 'Path to the file containing the issue'
                },
                line: {
                  type: 'number',
                  description: 'Line number where the issue occurs'
                },
                description: {
                  type: 'string',
                  description: 'Detailed description of the issue'
                }
              },
              required: ['severity', 'file', 'description']
            },
            description: 'List of issues found'
          },
          overall_status: {
            type: 'string',
            enum: ['passed', 'failed', 'needs_revision'],
            description: 'Overall verification result'
          },
          summary: {
            type: 'string',
            description: 'Summary of the verification process and findings'
          }
        },
        required: ['issues', 'overall_status', 'summary']
      }
    }
  }
];

// =============================================================================
// SUPERVISOR_TOOLS - For reviewing and cleanup
// =============================================================================

/**
 * Tools available to Supervisor agents.
 * Supervisors review agent work and generate consolidated summaries.
 * @type {Object[]}
 */
export const SUPERVISOR_TOOLS = [
  readFileTool,
  searchCodebaseTool,
  listDirectoryTool,
  {
    type: 'function',
    function: {
      name: 'generate_summary',
      description: 'Create a consolidated summary of agent work',
      parameters: {
        type: 'object',
        properties: {
          agent_outputs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agent_id: {
                  type: 'string',
                  description: 'ID of the agent whose work is being summarized'
                },
                summary: {
                  type: 'string',
                  description: 'Summary of that agent\'s contributions'
                }
              },
              required: ['agent_id', 'summary']
            },
            description: 'Summaries of individual agent outputs'
          },
          consolidated_summary: {
            type: 'string',
            description: 'Overall consolidated summary of all work'
          },
          recommendations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Recommendations for improvements or next steps'
          }
        },
        required: ['agent_outputs', 'consolidated_summary', 'recommendations']
      }
    }
  }
];

// =============================================================================
// IMPROVEMENTS_AGENT_TOOLS - For deep research
// =============================================================================

/**
 * Tools available to Improvements agents.
 * Improvements agents perform deep analysis and research.
 * @type {Object[]}
 */
export const IMPROVEMENTS_AGENT_TOOLS = [
  readFileTool,
  searchCodebaseTool,
  listDirectoryTool,
  {
    type: 'function',
    function: {
      name: 'analyze_code',
      description: 'Perform deep analysis of code patterns, architecture, or specific aspects',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to files or directories to analyze'
          },
          focus: {
            type: 'string',
            description: 'What aspect to focus the analysis on (e.g., "performance", "security", "architecture")'
          }
        },
        required: ['paths', 'focus']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'document_findings',
      description: 'Document research findings and recommendations',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The topic that was researched'
          },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                aspect: {
                  type: 'string',
                  description: 'Specific aspect that was analyzed'
                },
                analysis: {
                  type: 'string',
                  description: 'Detailed analysis of this aspect'
                },
                recommendations: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific recommendations for this aspect'
                }
              },
              required: ['aspect', 'analysis', 'recommendations']
            },
            description: 'Detailed findings organized by aspect'
          },
          summary: {
            type: 'string',
            description: 'Executive summary of all findings'
          }
        },
        required: ['topic', 'findings', 'summary']
      }
    }
  }
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get tools for a specific agent type
 * @param {string} agentType - The type of agent
 * @returns {Object[]} Array of tool definitions for that agent type
 */
export function getToolsForAgentType(agentType) {
  const toolMap = {
    orchestrator: ORCHESTRATOR_TOOLS,
    worker: WORKER_TOOLS,
    context: CONTEXT_AGENT_TOOLS,
    verifier: VERIFIER_TOOLS,
    supervisor: SUPERVISOR_TOOLS,
    improvements: IMPROVEMENTS_AGENT_TOOLS
  };

  return toolMap[agentType] || [];
}

/**
 * Get a specific tool definition by name
 * @param {string} toolName - The name of the tool
 * @param {string} agentType - Optional agent type to search within
 * @returns {Object|null} The tool definition or null if not found
 */
export function getToolByName(toolName, agentType = null) {
  const toolSets = agentType
    ? [getToolsForAgentType(agentType)]
    : [
        ORCHESTRATOR_TOOLS,
        WORKER_TOOLS,
        CONTEXT_AGENT_TOOLS,
        VERIFIER_TOOLS,
        SUPERVISOR_TOOLS,
        IMPROVEMENTS_AGENT_TOOLS
      ];

  for (const tools of toolSets) {
    const found = tools.find((t) => t.function.name === toolName);
    if (found) return found;
  }

  return null;
}

/**
 * Validate a tool call against its schema
 * @param {string} toolName - The name of the tool
 * @param {Object} args - The arguments to validate
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export function validateToolCall(toolName, args) {
  const tool = getToolByName(toolName);
  if (!tool) {
    return { valid: false, errors: [`Unknown tool: ${toolName}`] };
  }

  const errors = [];
  const params = tool.function.parameters;

  // Check required parameters
  if (params.required) {
    for (const required of params.required) {
      if (args[required] === undefined) {
        errors.push(`Missing required parameter: ${required}`);
      }
    }
  }

  // Check parameter types
  if (params.properties) {
    for (const [key, schema] of Object.entries(params.properties)) {
      if (args[key] !== undefined) {
        const value = args[key];
        const expectedType = schema.type;

        // Basic type checking
        if (expectedType === 'string' && typeof value !== 'string') {
          errors.push(`Parameter "${key}" must be a string`);
        } else if (expectedType === 'number' && typeof value !== 'number') {
          errors.push(`Parameter "${key}" must be a number`);
        } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Parameter "${key}" must be a boolean`);
        } else if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push(`Parameter "${key}" must be an array`);
        } else if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          errors.push(`Parameter "${key}" must be an object`);
        }

        // Check enum values
        if (schema.enum && !schema.enum.includes(value)) {
          errors.push(`Parameter "${key}" must be one of: ${schema.enum.join(', ')}`);
        }

        // Check number constraints
        if (expectedType === 'number') {
          if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`Parameter "${key}" must be >= ${schema.minimum}`);
          }
          if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`Parameter "${key}" must be <= ${schema.maximum}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  ORCHESTRATOR_TOOLS,
  WORKER_TOOLS,
  CONTEXT_AGENT_TOOLS,
  VERIFIER_TOOLS,
  SUPERVISOR_TOOLS,
  IMPROVEMENTS_AGENT_TOOLS,
  getToolsForAgentType,
  getToolByName,
  validateToolCall
};
