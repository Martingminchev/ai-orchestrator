// Subagent System Prompt Builder
// Creates system prompts for subagents with proper context

import type { AgentType } from "../../agents/types.js";

export interface SubagentPromptContext {
  taskId: string;
  parentSessionKey: string;
  agentType: AgentType;
  globalContext?: string;
  locationContext?: string;
  skillContext?: string;
  ragContext?: string[];
  constraints?: string[];
  previousResults?: Array<{ agentId: string; summary: string }>;
}

/**
 * Build a system prompt for a subagent
 */
export function buildSubagentSystemPrompt(context: SubagentPromptContext): string {
  const sections: string[] = [];

  // Header
  sections.push(`# MOLT-OS ${context.agentType.toUpperCase()} Agent

You are a specialized ${context.agentType} agent operating within the MOLT-OS orchestration system.

## Session Information
- Task ID: ${context.taskId}
- Session: ${context.parentSessionKey}
- Agent Type: ${context.agentType}
`);

  // Core capabilities based on agent type
  sections.push(getAgentCapabilities(context.agentType));

  // Global context
  if (context.globalContext) {
    sections.push(`## Global Context
${context.globalContext}
`);
  }

  // Location context
  if (context.locationContext) {
    sections.push(`## Location Context
${context.locationContext}
`);
  }

  // Skill context
  if (context.skillContext) {
    sections.push(`## Skill Context
${context.skillContext}
`);
  }

  // RAG context
  if (context.ragContext && context.ragContext.length > 0) {
    sections.push(`## Relevant Information
${context.ragContext.map((item, i) => `${i + 1}. ${item}`).join("\n")}
`);
  }

  // Previous results
  if (context.previousResults && context.previousResults.length > 0) {
    sections.push(`## Previous Agent Results
${context.previousResults.map((r) => `- ${r.agentId}: ${r.summary}`).join("\n")}
`);
  }

  // Constraints
  if (context.constraints && context.constraints.length > 0) {
    sections.push(`## Constraints
${context.constraints.map((c) => `- ${c}`).join("\n")}
`);
  }

  // Instructions
  sections.push(`## Instructions
1. Use the available tools to complete your assigned task
2. Be efficient and focused on the specific task
3. Report any errors or blockers clearly
4. When complete, provide a concise summary of what was accomplished
5. If you cannot complete the task, explain why and suggest alternatives

## Output Format
When you have completed the task, provide:
- A brief summary of what was done
- Any files created or modified
- Any issues encountered
- Recommendations for next steps (if applicable)
`);

  return sections.join("\n");
}

/**
 * Get capabilities description for an agent type
 */
function getAgentCapabilities(agentType: AgentType): string {
  switch (agentType) {
    case "file":
      return `## Capabilities
As a File Agent, you can:
- Read files (any encoding, with line ranges)
- Write files (creates directories as needed)
- List directory contents
- Search files using glob patterns
- Copy, move, and delete files
- Create directories

## Best Practices
- Always verify paths before operations
- Use relative paths when possible
- Check if files exist before reading
- Create parent directories before writing
`;

    case "code":
      return `## Capabilities
As a Code Agent, you can:
- Read and analyze source code
- Write new code files
- Edit existing code (search and replace)
- Search for patterns across files
- Analyze code structure (functions, classes, imports)

## Best Practices
- Follow existing code style
- Add appropriate comments
- Handle errors gracefully
- Keep functions focused and small
- Use meaningful names
`;

    case "research":
      return `## Capabilities
As a Research Agent, you can:
- Think through problems step by step
- Take notes on findings
- Compare options
- Summarize information
- Make recommendations
- Provide answers with confidence levels

## Best Practices
- Be systematic in your research
- Consider multiple perspectives
- Note sources and evidence
- Be clear about uncertainty
- Provide actionable recommendations
`;

    case "system":
      return `## Capabilities
As a System Agent, you can:
- Run shell commands (with safety restrictions)
- Check environment variables
- Get system information
- Check if processes are running
- Locate executables

## Safety Restrictions
- Certain dangerous commands are blocked (rm, shutdown, etc.)
- Redirect operators are not allowed
- Commands have a timeout limit
- Sensitive environment variables are filtered

## Best Practices
- Use specific commands rather than broad ones
- Check command availability before running
- Handle command failures gracefully
`;

    default:
      return `## Capabilities
You are a general-purpose agent with access to various tools.
Use the available tools to complete your assigned task.
`;
  }
}

/**
 * Build a user prompt from a task description
 */
export function buildUserPrompt(taskDescription: string, additionalContext?: string): string {
  let prompt = `## Task
${taskDescription}
`;

  if (additionalContext) {
    prompt += `
## Additional Context
${additionalContext}
`;
  }

  prompt += `
Please complete this task using the available tools. When finished, provide a summary of what was accomplished.
`;

  return prompt;
}

/**
 * Build a followup prompt for continuing work
 */
export function buildFollowupPrompt(
  previousSummary: string,
  nextSteps: string,
  additionalInstructions?: string
): string {
  let prompt = `## Previous Work Summary
${previousSummary}

## Next Steps
${nextSteps}
`;

  if (additionalInstructions) {
    prompt += `
## Additional Instructions
${additionalInstructions}
`;
  }

  prompt += `
Continue from where the previous work left off. Complete the next steps and provide an updated summary.
`;

  return prompt;
}
