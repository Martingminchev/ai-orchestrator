/**
 * Agent Orchestration System
 * 
 * Main entry point for the orchestrator and sub-agent modules.
 * 
 * @example
 * import { Orchestrator, runOrchestrator } from './agents/index.js';
 * 
 * const orchestrator = new Orchestrator(apiKey, tokenTracker, eventEmitter);
 * await orchestrator.runTask(taskId, userMessage);
 */

// Agent classes
export { BaseAgent } from './baseAgent.js';
export { ContextAgent, gatherContextForTask } from './contextAgent.js';
export { WorkerAgent, createWorkerAgent } from './workerAgent.js';
export { VerifierAgent, verifyWork } from './verifierAgent.js';
export { SupervisorAgent, superviseWork } from './supervisorAgent.js';
export { ImprovementsAgent, researchTopic } from './improvementsAgent.js';
export { Assigner, createAssigner } from './assigner.js';
export { Orchestrator, runOrchestrator } from './orchestrator.js';

// Registry
export { AgentRegistry, agentRegistry } from './agentRegistry.js';

// Tools
export { 
  ORCHESTRATOR_TOOLS,
  WORKER_TOOLS,
  CONTEXT_AGENT_TOOLS,
  VERIFIER_TOOLS,
  SUPERVISOR_TOOLS,
  IMPROVEMENTS_AGENT_TOOLS,
  getToolsForAgentType,
  getToolByName
} from './tools/definitions.js';

// Prompts
export {
  ORCHESTRATOR_SYSTEM_PROMPT,
  ASSIGNER_SYSTEM_PROMPT,
  CONTEXT_AGENT_PROMPT,
  WORKER_AGENT_BASE_PROMPT,
  VERIFIER_AGENT_PROMPT,
  SUPERVISOR_AGENT_PROMPT,
  IMPROVEMENTS_AGENT_PROMPT,
  PROMPTS,
  generateWorkerPrompt
} from './prompts.js';
