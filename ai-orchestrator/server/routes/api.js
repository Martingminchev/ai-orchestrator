import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { appState } from '../index.js';
import { tokenTracker } from '../services/tokenTracker.js';
import { agentRegistry } from '../agents/agentRegistry.js';
import { resultsManager } from '../services/resultsManager.js';

const router = express.Router();

// Store for SSE clients and task data
const taskStreams = new Map(); // taskId -> { clients: Set, events: [], status }

// Store pending user interactions (for blocking call_user tool)
const pendingInteractions = new Map(); // taskId -> { resolve, reject, request }

/**
 * POST /api/config - Save Moonshot API key
 */
router.post('/config', (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'API key is required' });
  }
  
  if (!apiKey.startsWith('sk-')) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }
  
  appState.apiKey = apiKey;
  console.log('API key configured successfully');
  
  res.json({ success: true, message: 'API key saved' });
});

/**
 * GET /api/config - Check if API key is configured
 */
router.get('/config', (req, res) => {
  res.json({ hasApiKey: !!appState.apiKey });
});

/**
 * POST /api/task - Start a new task
 * 
 * Body:
 * - task: string (required) - The task description
 * - projectName: string (required) - Name of the project to work in
 */
router.post('/task', async (req, res) => {
  const { task, projectName } = req.body;
  
  if (!task || typeof task !== 'string') {
    return res.status(400).json({ error: 'Task description is required' });
  }
  
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'Project name is required' });
  }
  
  if (!appState.apiKey) {
    return res.status(401).json({ error: 'API key not configured' });
  }
  
  const taskId = uuidv4();
  
  // Initialize task stream data
  taskStreams.set(taskId, {
    clients: new Set(),
    events: [],
    status: 'pending',
    abortController: new AbortController(),
  });
  
  // Store in active tasks
  appState.activeTasks.set(taskId, {
    task,
    projectName,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  
  // Reset token tracker for new task
  tokenTracker.reset();
  
  // Start orchestrator asynchronously (errors are handled inside startOrchestrator)
  startOrchestrator(taskId, task, projectName);
  
  res.json({ taskId, projectName, status: 'started' });
});

/**
 * GET /api/stream/:taskId - SSE endpoint for task events
 */
router.get('/stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  const taskStream = taskStreams.get(taskId);
  if (!taskStream) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  
  // Send any existing events (for late joiners)
  for (const event of taskStream.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  
  // Add this client to the task's client set
  taskStream.clients.add(res);
  
  // Handle client disconnect
  req.on('close', () => {
    taskStream.clients.delete(res);
    console.log(`Client disconnected from task ${taskId}`);
  });
});

/**
 * GET /api/tokens - Get current token usage stats
 */
router.get('/tokens', (req, res) => {
  const stats = tokenTracker.getStats();
  res.json(stats);
});

/**
 * POST /api/cancel/:taskId - Cancel a running task
 */
router.post('/cancel/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  const taskStream = taskStreams.get(taskId);
  if (!taskStream) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  if (taskStream.status === 'completed' || taskStream.status === 'cancelled') {
    return res.status(400).json({ error: 'Task already finished' });
  }
  
  // Abort the task
  taskStream.abortController.abort();
  taskStream.status = 'cancelled';
  
  // Reject any pending interaction
  const pending = pendingInteractions.get(taskId);
  if (pending) {
    pending.reject(new Error('Task cancelled'));
    pendingInteractions.delete(taskId);
  }
  
  // Emit cancellation event
  emitToTask(taskId, {
    type: 'cancelled',
    message: 'Task cancelled by user',
    timestamp: new Date().toISOString(),
  });
  
  // Update active tasks
  const activeTask = appState.activeTasks.get(taskId);
  if (activeTask) {
    activeTask.status = 'cancelled';
  }
  
  res.json({ success: true, message: 'Task cancelled' });
});

/**
 * POST /api/task/:taskId/respond - User responds to agent question
 */
router.post('/task/:taskId/respond', (req, res) => {
  const { taskId } = req.params;
  const { response } = req.body;
  
  const pending = pendingInteractions.get(taskId);
  if (!pending) {
    return res.status(404).json({ error: 'No pending interaction for this task' });
  }
  
  pending.resolve(response);
  pendingInteractions.delete(taskId);
  
  res.json({ success: true });
});

/**
 * GET /api/task/:taskId/agents - Get all agents for a task
 */
router.get('/task/:taskId/agents', (req, res) => {
  const { taskId } = req.params;
  const agents = agentRegistry.getTaskAgents(taskId);
  res.json({ agents });
});

/**
 * GET /api/task/:taskId/agents/:agentId - Get specific agent
 */
router.get('/task/:taskId/agents/:agentId', (req, res) => {
  const { agentId } = req.params;
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(agent);
});

/**
 * GET /api/results - List all task results
 */
router.get('/results', async (req, res) => {
  const tasks = await resultsManager.listTasks();
  res.json({ tasks });
});

/**
 * GET /api/results/:taskId - Get task result details
 */
router.get('/results/:taskId', async (req, res) => {
  const { taskId } = req.params;
  try {
    const manifest = await resultsManager.getManifest(taskId);
    res.json(manifest);
  } catch (error) {
    res.status(404).json({ error: 'Task not found' });
  }
});

/**
 * GET /api/results/:taskId/log - Get execution log
 */
router.get('/results/:taskId/log', async (req, res) => {
  const { taskId } = req.params;
  try {
    const log = await resultsManager.getExecutionLog(taskId);
    res.json(log);
  } catch (error) {
    res.status(404).json({ error: 'Log not found' });
  }
});

/**
 * Emit an event to all clients subscribed to a task
 */
export function emitToTask(taskId, event) {
  const taskStream = taskStreams.get(taskId);
  if (!taskStream) return;
  
  // Store event for late joiners
  taskStream.events.push(event);
  
  // Send to all connected clients
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of taskStream.clients) {
    try {
      if (!client.writableEnded) {
        client.write(data);
      }
    } catch (err) {
      console.error('[emitToTask] Error writing to client:', err.message);
      taskStream.clients.delete(client);
    }
  }
}

/**
 * Get the abort signal for a task
 */
export function getTaskAbortSignal(taskId) {
  const taskStream = taskStreams.get(taskId);
  return taskStream?.abortController.signal;
}

/**
 * Create user interaction handler for the orchestrator
 * This enables the blocking call_user tool functionality
 */
function createUserInteractionHandler(taskId) {
  return (request) => {
    return new Promise((resolve, reject) => {
      pendingInteractions.set(taskId, { resolve, reject, request });
      
      // Emit the interaction request to the client
      emitToTask(taskId, {
        type: 'user_interaction',
        ...request,
        timestamp: new Date().toISOString(),
      });
    });
  };
}

/**
 * Start the orchestrator for a task
 * @param {string} taskId - Unique task identifier
 * @param {string} task - Task description
 * @param {string} projectName - Name of the project to work in
 */
async function startOrchestrator(taskId, task, projectName) {
  console.log(`[startOrchestrator] Starting task ${taskId} for project: ${projectName}`);
  
  const taskStream = taskStreams.get(taskId);
  if (!taskStream) {
    console.error(`[startOrchestrator] No task stream found for ${taskId}`);
    return;
  }
  
  taskStream.status = 'running';
  
  // Update active task status
  const activeTask = appState.activeTasks.get(taskId);
  if (activeTask) {
    activeTask.status = 'running';
  }
  
  // Register token tracker listener to emit real-time token updates
  const unsubscribeTokens = tokenTracker.onUpdate((stats) => {
    emitToTask(taskId, {
      type: 'token_update',
      tokens: stats,
      timestamp: new Date().toISOString(),
    });
  });
  
  // Emit task started event
  emitToTask(taskId, {
    type: 'task_started',
    task,
    projectName,
    timestamp: new Date().toISOString(),
  });
  
  try {
    console.log(`[startOrchestrator] Importing orchestrator module...`);
    // Dynamic import of orchestrator to avoid circular dependencies
    const { runOrchestrator } = await import('../agents/orchestrator.js');
    
    console.log(`[startOrchestrator] Running orchestrator...`);
    const result = await runOrchestrator(taskId, task, {
      apiKey: appState.apiKey,
      projectName,
      emit: (event) => emitToTask(taskId, { ...event, timestamp: new Date().toISOString() }),
      abortSignal: taskStream.abortController.signal,
      onUserInteraction: createUserInteractionHandler(taskId),
    });
    
    console.log(`[startOrchestrator] Orchestrator finished:`, result?.success ? 'success' : 'failed');
    
    taskStream.status = 'completed';
    if (activeTask) {
      activeTask.status = 'completed';
    }
    
    // Unsubscribe from token updates
    unsubscribeTokens();
    
    emitToTask(taskId, {
      type: 'complete',
      status: 'success',
      result: {
        summary: result?.summary,
        deliverables: result?.deliverables,
      },
      tokens: tokenTracker.getStats(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Unsubscribe from token updates on error too
    unsubscribeTokens();
    
    if (error.name === 'AbortError') {
      console.log(`Task ${taskId} was cancelled`);
      return;
    }
    
    console.error(`[startOrchestrator] Task ${taskId} error:`, error.message);
    console.error('[startOrchestrator] Stack:', error.stack);
    console.error('[startOrchestrator] Full error object:', error);
    
    taskStream.status = 'error';
    if (activeTask) {
      activeTask.status = 'error';
    }
    
    // Don't throw - emit error and complete events instead
    // Mark as fatal so frontend knows to close the connection
    emitToTask(taskId, {
      type: 'error',
      error: error.message,
      stack: error.stack,
      fatal: true,
      timestamp: new Date().toISOString(),
    });
    emitToTask(taskId, {
      type: 'complete',
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
