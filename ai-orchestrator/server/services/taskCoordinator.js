import { EventEmitter } from 'events';

/**
 * @typedef {'read' | 'write'} LockType
 */

/**
 * @typedef {Object} FileLock
 * @property {string} agentId - The agent holding the lock
 * @property {LockType} lockType - Type of lock (read or write)
 * @property {Date} acquiredAt - When the lock was acquired
 * @property {string} [taskId] - Associated task ID if any
 */

/**
 * @typedef {Object} ReadLockSet
 * @property {'read'} lockType - Always 'read' for read lock sets
 * @property {Map<string, { acquiredAt: Date, taskId?: string }>} readers - Map of agentId to lock info
 */

/**
 * @typedef {Object} QueuedLockRequest
 * @property {string} agentId - Agent requesting the lock
 * @property {LockType} lockType - Type of lock requested
 * @property {string} [taskId] - Associated task ID
 * @property {Function} resolve - Promise resolve function
 * @property {Function} reject - Promise reject function
 * @property {number} queuedAt - Timestamp when queued
 */

/**
 * @typedef {Object} ActiveTask
 * @property {Set<string>} agentIds - Agents working on this task
 * @property {Set<string>} files - Files locked by this task
 * @property {'active' | 'completed'} status - Task status
 */

/**
 * @typedef {Object} AcquireLockOptions
 * @property {number} [timeout=30000] - How long to wait for lock in ms
 * @property {string} [taskId] - Associated task ID
 */

/**
 * @typedef {Object} AcquireLockResult
 * @property {boolean} success - Whether lock was acquired
 * @property {string} [error] - Error message if failed
 * @property {number} [waited] - Milliseconds waited for lock
 * @property {string} [conflictingAgent] - Agent that caused conflict
 */

/**
 * @typedef {Object} ReleaseLockResult
 * @property {boolean} success - Whether lock was released
 * @property {string} [error] - Error message if failed
 * @property {number} [queuedAgentsNotified] - Number of waiting agents notified
 */

/**
 * @typedef {Object} ReleaseAllLocksResult
 * @property {string[]} released - Paths that were released
 * @property {number} queuedAgentsNotified - Total waiting agents notified
 */

/**
 * @typedef {Object} LockInfo
 * @property {boolean} locked - Whether file is locked
 * @property {LockType} [lockType] - Type of lock
 * @property {string} [agentId] - Agent holding lock (for write) or first reader (for read)
 * @property {string[]} [agentIds] - All agents holding read locks
 * @property {Date} [acquiredAt] - When first lock was acquired
 * @property {number} [queueLength] - Number of waiting requests
 */

/**
 * @typedef {Object} AgentLock
 * @property {string} path - File path
 * @property {LockType} lockType - Type of lock
 * @property {Date} acquiredAt - When lock was acquired
 */

/**
 * @typedef {Object} ConflictCheckResult
 * @property {boolean} conflicts - Whether there would be a conflict
 * @property {string} [reason] - Reason for conflict
 * @property {string} [conflictingAgent] - Agent causing conflict
 * @property {string} [suggestion] - Suggestion for resolution
 */

/**
 * @typedef {Object} TaskStatus
 * @property {boolean} exists - Whether task exists
 * @property {string[]} [agentIds] - Agents assigned to task
 * @property {string[]} [lockedFiles] - Files locked by task's agents
 * @property {'active' | 'completed'} [status] - Task status
 */

/**
 * @typedef {Object} ActiveConflict
 * @property {string} file - File path with conflict
 * @property {Array<{ agentId: string, lockType: string }>} holders - Current lock holders
 * @property {Array<{ agentId: string, lockType: string }>} waiters - Agents waiting for lock
 */

/**
 * @typedef {Object} StaleLockRelease
 * @property {string} path - File path
 * @property {string} agentId - Agent that held the lock
 * @property {number} age - Age of lock in ms
 */

/**
 * TaskCoordinator prevents task/file conflicts when multiple agents work in parallel.
 * It implements file locking with support for multiple readers and exclusive writers,
 * with fair queuing for conflicting requests.
 * 
 * @extends EventEmitter
 * @fires TaskCoordinator#lockReleased - When a lock is released
 * @fires TaskCoordinator#lockAcquired - When a lock is acquired
 * @fires TaskCoordinator#conflictDetected - When a conflict is detected
 * @fires TaskCoordinator#deadlockDetected - When a potential deadlock is detected
 */
export class TaskCoordinator extends EventEmitter {
  /**
   * Creates a new TaskCoordinator instance.
   */
  constructor() {
    super();
    
    /**
     * Map of file paths to their current lock state.
     * For write locks: { agentId, lockType: 'write', acquiredAt, taskId? }
     * For read locks: { lockType: 'read', readers: Map<agentId, { acquiredAt, taskId? }> }
     * @type {Map<string, FileLock | ReadLockSet>}
     * @private
     */
    this.fileLocks = new Map();
    
    /**
     * Queue of pending lock requests per file (FIFO).
     * @type {Map<string, QueuedLockRequest[]>}
     * @private
     */
    this.taskQueue = new Map();
    
    /**
     * Map of active tasks and their metadata.
     * @type {Map<string, ActiveTask>}
     * @private
     */
    this.activeTasks = new Map();
    
    /**
     * Debug logging enabled flag.
     * @type {boolean}
     * @private
     */
    this.debugEnabled = process.env.DEBUG_TASK_COORDINATOR === 'true';
  }

  /**
   * Log debug messages if debug mode is enabled.
   * @param {string} message - Message to log
   * @param {Object} [data] - Additional data to log
   * @private
   */
  _debug(message, data = {}) {
    if (this.debugEnabled) {
      console.log(`[TaskCoordinator] ${message}`, JSON.stringify(data, null, 2));
    }
  }

  /**
   * Normalize file path for consistent key usage.
   * @param {string} filePath - File path to normalize
   * @returns {string} Normalized path
   * @private
   */
  _normalizePath(filePath) {
    // Normalize path separators and case for Windows compatibility
    return filePath.replace(/\\/g, '/').toLowerCase();
  }

  /**
   * Check if the current lock allows the requested lock type.
   * @param {FileLock | ReadLockSet | undefined} currentLock - Current lock state
   * @param {string} agentId - Agent requesting lock
   * @param {LockType} requestedType - Type of lock requested
   * @returns {{ allowed: boolean, reason?: string, conflictingAgent?: string }}
   * @private
   */
  _canAcquireLock(currentLock, agentId, requestedType) {
    // No existing lock - always allowed
    if (!currentLock) {
      return { allowed: true };
    }

    // Handle read lock set
    if (currentLock.lockType === 'read') {
      const readLockSet = /** @type {ReadLockSet} */ (currentLock);
      
      // Agent already has a read lock
      if (readLockSet.readers.has(agentId)) {
        if (requestedType === 'read') {
          return { allowed: true }; // Already has read lock
        }
        // Upgrade to write lock - only allowed if sole reader
        if (readLockSet.readers.size === 1) {
          return { allowed: true }; // Can upgrade
        }
        const otherReaders = [...readLockSet.readers.keys()].filter(id => id !== agentId);
        return {
          allowed: false,
          reason: 'Cannot upgrade to write lock while other readers exist',
          conflictingAgent: otherReaders[0]
        };
      }
      
      // New agent requesting read lock - always allowed
      if (requestedType === 'read') {
        return { allowed: true };
      }
      
      // New agent requesting write lock while readers exist
      const firstReader = [...readLockSet.readers.keys()][0];
      return {
        allowed: false,
        reason: 'File has active read locks',
        conflictingAgent: firstReader
      };
    }

    // Handle write lock
    const writeLock = /** @type {FileLock} */ (currentLock);
    
    // Same agent already has write lock
    if (writeLock.agentId === agentId) {
      return { allowed: true }; // Re-entrant
    }
    
    // Another agent has write lock
    return {
      allowed: false,
      reason: `File is write-locked by another agent`,
      conflictingAgent: writeLock.agentId
    };
  }

  /**
   * Process the next queued request for a file after a lock is released.
   * @param {string} normalizedPath - Normalized file path
   * @returns {number} Number of agents notified
   * @private
   */
  _processQueue(normalizedPath) {
    const queue = this.taskQueue.get(normalizedPath);
    if (!queue || queue.length === 0) {
      return 0;
    }

    let notified = 0;
    const currentLock = this.fileLocks.get(normalizedPath);

    // Process queue - for read locks, we can grant multiple at once
    const toProcess = [];
    
    for (let i = 0; i < queue.length; i++) {
      const request = queue[i];
      const canAcquire = this._canAcquireLock(currentLock, request.agentId, request.lockType);
      
      if (canAcquire.allowed) {
        toProcess.push({ index: i, request });
        
        // If this is a write lock request, stop processing (only one can proceed)
        if (request.lockType === 'write') {
          break;
        }
        
        // For read locks, continue checking if more readers can proceed
        // But stop if we hit a write request (maintain FIFO fairness)
        if (i + 1 < queue.length && queue[i + 1].lockType === 'write') {
          break;
        }
      } else if (request.lockType === 'write') {
        // Write request blocked - stop processing to maintain order
        break;
      }
    }

    // Remove processed requests from queue (in reverse to maintain indices)
    for (let i = toProcess.length - 1; i >= 0; i--) {
      queue.splice(toProcess[i].index, 1);
    }

    // Grant locks to processed requests
    for (const { request } of toProcess) {
      this._grantLock(normalizedPath, request.agentId, request.lockType, request.taskId);
      request.resolve({
        success: true,
        waited: Date.now() - request.queuedAt
      });
      notified++;
    }

    // Clean up empty queue
    if (queue.length === 0) {
      this.taskQueue.delete(normalizedPath);
    }

    return notified;
  }

  /**
   * Grant a lock to an agent.
   * @param {string} normalizedPath - Normalized file path
   * @param {string} agentId - Agent to grant lock to
   * @param {LockType} lockType - Type of lock to grant
   * @param {string} [taskId] - Associated task ID
   * @private
   */
  _grantLock(normalizedPath, agentId, lockType, taskId) {
    const now = new Date();
    
    if (lockType === 'write') {
      // Check if upgrading from read lock
      const currentLock = this.fileLocks.get(normalizedPath);
      if (currentLock && currentLock.lockType === 'read') {
        const readLockSet = /** @type {ReadLockSet} */ (currentLock);
        if (readLockSet.readers.has(agentId)) {
          // Upgrading - remove from readers
          readLockSet.readers.delete(agentId);
        }
      }
      
      this.fileLocks.set(normalizedPath, {
        agentId,
        lockType: 'write',
        acquiredAt: now,
        taskId
      });
    } else {
      // Read lock
      let lockSet = this.fileLocks.get(normalizedPath);
      
      if (!lockSet || lockSet.lockType === 'write') {
        // New read lock set
        lockSet = {
          lockType: 'read',
          readers: new Map()
        };
        this.fileLocks.set(normalizedPath, lockSet);
      }
      
      const readLockSet = /** @type {ReadLockSet} */ (lockSet);
      readLockSet.readers.set(agentId, { acquiredAt: now, taskId });
    }

    // Update task tracking
    if (taskId && this.activeTasks.has(taskId)) {
      const task = this.activeTasks.get(taskId);
      task.files.add(normalizedPath);
    }

    this._debug('Lock granted', { path: normalizedPath, agentId, lockType, taskId });
    this.emit('lockAcquired', { path: normalizedPath, agentId, lockType });
  }

  /**
   * Detect potential deadlocks by checking for circular wait conditions.
   * @param {string} agentId - Agent requesting lock
   * @param {string} normalizedPath - Path being requested
   * @returns {{ deadlock: boolean, cycle?: string[] }}
   * @private
   */
  _detectDeadlock(agentId, normalizedPath) {
    // Build a wait-for graph and check for cycles
    // Agent A waits for Agent B if A is queued for a file B holds
    
    const visited = new Set();
    const path = [agentId];
    
    const findCycle = (currentAgent) => {
      if (visited.has(currentAgent)) {
        const cycleStart = path.indexOf(currentAgent);
        if (cycleStart !== -1) {
          return path.slice(cycleStart);
        }
        return null;
      }
      
      visited.add(currentAgent);
      
      // Find files this agent is waiting for
      for (const [filePath, queue] of this.taskQueue.entries()) {
        const isWaiting = queue.some(req => req.agentId === currentAgent);
        if (!isWaiting) continue;
        
        // Find who holds this file
        const lock = this.fileLocks.get(filePath);
        if (!lock) continue;
        
        let holders = [];
        if (lock.lockType === 'write') {
          holders = [/** @type {FileLock} */ (lock).agentId];
        } else {
          holders = [.../** @type {ReadLockSet} */ (lock).readers.keys()];
        }
        
        for (const holder of holders) {
          if (holder === currentAgent) continue;
          path.push(holder);
          const cycle = findCycle(holder);
          if (cycle) return cycle;
          path.pop();
        }
      }
      
      return null;
    };

    // Check what the requesting agent would wait for
    const currentLock = this.fileLocks.get(normalizedPath);
    if (!currentLock) {
      return { deadlock: false };
    }

    let holders = [];
    if (currentLock.lockType === 'write') {
      holders = [/** @type {FileLock} */ (currentLock).agentId];
    } else {
      holders = [.../** @type {ReadLockSet} */ (currentLock).readers.keys()];
    }

    for (const holder of holders) {
      if (holder === agentId) continue;
      path.push(holder);
      const cycle = findCycle(holder);
      if (cycle) {
        this._debug('Deadlock detected', { cycle });
        this.emit('deadlockDetected', { cycle, requestingAgent: agentId, file: normalizedPath });
        return { deadlock: true, cycle };
      }
      path.pop();
    }

    return { deadlock: false };
  }

  /**
   * Acquire a lock on a file for an agent.
   * 
   * @param {string} agentId - ID of the agent requesting the lock
   * @param {string} filePath - Path to the file to lock
   * @param {LockType} lockType - Type of lock ('read' or 'write')
   * @param {AcquireLockOptions} [options] - Additional options
   * @returns {Promise<AcquireLockResult>} Result of the lock acquisition
   * 
   * @example
   * // Acquire a write lock with default timeout
   * const result = await coordinator.acquireLock('agent-1', '/path/to/file.js', 'write');
   * if (result.success) {
   *   // File is now locked for writing
   * }
   * 
   * @example
   * // Acquire a read lock with custom timeout
   * const result = await coordinator.acquireLock('agent-2', '/path/to/file.js', 'read', {
   *   timeout: 5000,
   *   taskId: 'task-123'
   * });
   */
  async acquireLock(agentId, filePath, lockType, options = {}) {
    const { timeout = 30000, taskId } = options;
    const normalizedPath = this._normalizePath(filePath);
    
    this._debug('Lock requested', { agentId, path: normalizedPath, lockType, taskId });

    // Check if lock can be acquired immediately
    const currentLock = this.fileLocks.get(normalizedPath);
    const canAcquire = this._canAcquireLock(currentLock, agentId, lockType);

    if (canAcquire.allowed) {
      this._grantLock(normalizedPath, agentId, lockType, taskId);
      return { success: true, waited: 0 };
    }

    // Check for deadlock before queuing
    const deadlockCheck = this._detectDeadlock(agentId, normalizedPath);
    if (deadlockCheck.deadlock) {
      return {
        success: false,
        error: `Deadlock detected: ${deadlockCheck.cycle.join(' -> ')}`,
        conflictingAgent: canAcquire.conflictingAgent
      };
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      const request = {
        agentId,
        lockType,
        taskId,
        resolve,
        reject,
        queuedAt: Date.now()
      };

      if (!this.taskQueue.has(normalizedPath)) {
        this.taskQueue.set(normalizedPath, []);
      }
      this.taskQueue.get(normalizedPath).push(request);

      this._debug('Request queued', { agentId, path: normalizedPath, lockType, queuePosition: this.taskQueue.get(normalizedPath).length });
      this.emit('conflictDetected', {
        file: normalizedPath,
        requestingAgent: agentId,
        conflictingAgent: canAcquire.conflictingAgent,
        requestedLockType: lockType
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        const queue = this.taskQueue.get(normalizedPath);
        if (queue) {
          const index = queue.findIndex(r => r.agentId === agentId && r.queuedAt === request.queuedAt);
          if (index !== -1) {
            queue.splice(index, 1);
            if (queue.length === 0) {
              this.taskQueue.delete(normalizedPath);
            }
          }
        }
        resolve({
          success: false,
          error: `Lock acquisition timed out after ${timeout}ms`,
          waited: timeout,
          conflictingAgent: canAcquire.conflictingAgent
        });
      }, timeout);

      // Override resolve to clear timeout
      const originalResolve = request.resolve;
      request.resolve = (result) => {
        clearTimeout(timeoutId);
        originalResolve(result);
      };
    });
  }

  /**
   * Release a lock held by an agent on a file.
   * 
   * @param {string} agentId - ID of the agent releasing the lock
   * @param {string} filePath - Path to the file to unlock
   * @returns {ReleaseLockResult} Result of the lock release
   * 
   * @example
   * const result = coordinator.releaseLock('agent-1', '/path/to/file.js');
   * console.log(`Released, notified ${result.queuedAgentsNotified} waiting agents`);
   */
  releaseLock(agentId, filePath) {
    const normalizedPath = this._normalizePath(filePath);
    const currentLock = this.fileLocks.get(normalizedPath);

    if (!currentLock) {
      return { success: false, error: 'No lock exists on this file' };
    }

    let released = false;

    if (currentLock.lockType === 'write') {
      const writeLock = /** @type {FileLock} */ (currentLock);
      if (writeLock.agentId !== agentId) {
        return { success: false, error: 'Lock is held by a different agent' };
      }
      this.fileLocks.delete(normalizedPath);
      released = true;
    } else {
      const readLockSet = /** @type {ReadLockSet} */ (currentLock);
      if (!readLockSet.readers.has(agentId)) {
        return { success: false, error: 'Agent does not hold a read lock on this file' };
      }
      readLockSet.readers.delete(agentId);
      if (readLockSet.readers.size === 0) {
        this.fileLocks.delete(normalizedPath);
      }
      released = true;
    }

    if (released) {
      this._debug('Lock released', { agentId, path: normalizedPath });
      this.emit('lockReleased', { path: normalizedPath, agentId });

      // Process waiting requests
      const notified = this._processQueue(normalizedPath);
      return { success: true, queuedAgentsNotified: notified };
    }

    return { success: false, error: 'Unknown error releasing lock' };
  }

  /**
   * Release all locks held by an agent.
   * Useful when an agent completes its work or crashes.
   * 
   * @param {string} agentId - ID of the agent
   * @returns {ReleaseAllLocksResult} Result with released paths and notification count
   * 
   * @example
   * const result = coordinator.releaseAllLocks('agent-1');
   * console.log(`Released ${result.released.length} locks`);
   */
  releaseAllLocks(agentId) {
    const released = [];
    let queuedAgentsNotified = 0;

    for (const [normalizedPath, lock] of this.fileLocks.entries()) {
      let shouldRelease = false;

      if (lock.lockType === 'write') {
        shouldRelease = /** @type {FileLock} */ (lock).agentId === agentId;
      } else {
        const readLockSet = /** @type {ReadLockSet} */ (lock);
        shouldRelease = readLockSet.readers.has(agentId);
      }

      if (shouldRelease) {
        const result = this.releaseLock(agentId, normalizedPath);
        if (result.success) {
          released.push(normalizedPath);
          queuedAgentsNotified += result.queuedAgentsNotified || 0;
        }
      }
    }

    // Also remove from any queues
    for (const [path, queue] of this.taskQueue.entries()) {
      const initialLength = queue.length;
      const filtered = queue.filter(req => req.agentId !== agentId);
      if (filtered.length !== initialLength) {
        if (filtered.length === 0) {
          this.taskQueue.delete(path);
        } else {
          this.taskQueue.set(path, filtered);
        }
      }
    }

    this._debug('All locks released for agent', { agentId, released, queuedAgentsNotified });
    return { released, queuedAgentsNotified };
  }

  /**
   * Get information about a lock on a specific file.
   * 
   * @param {string} filePath - Path to the file
   * @returns {LockInfo | null} Lock information or null if not locked
   * 
   * @example
   * const info = coordinator.getLockInfo('/path/to/file.js');
   * if (info?.locked) {
   *   console.log(`Locked by ${info.agentId} since ${info.acquiredAt}`);
   * }
   */
  getLockInfo(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    const lock = this.fileLocks.get(normalizedPath);
    const queue = this.taskQueue.get(normalizedPath);

    if (!lock) {
      return {
        locked: false,
        queueLength: queue?.length || 0
      };
    }

    if (lock.lockType === 'write') {
      const writeLock = /** @type {FileLock} */ (lock);
      return {
        locked: true,
        lockType: 'write',
        agentId: writeLock.agentId,
        acquiredAt: writeLock.acquiredAt,
        queueLength: queue?.length || 0
      };
    }

    const readLockSet = /** @type {ReadLockSet} */ (lock);
    const readers = [...readLockSet.readers.entries()];
    const firstReader = readers[0];

    return {
      locked: true,
      lockType: 'read',
      agentId: firstReader?.[0],
      agentIds: readers.map(([id]) => id),
      acquiredAt: firstReader?.[1].acquiredAt,
      queueLength: queue?.length || 0
    };
  }

  /**
   * Get all locks held by a specific agent.
   * 
   * @param {string} agentId - ID of the agent
   * @returns {AgentLock[]} Array of locks held by the agent
   * 
   * @example
   * const locks = coordinator.getAgentLocks('agent-1');
   * locks.forEach(lock => {
   *   console.log(`${lock.lockType} lock on ${lock.path}`);
   * });
   */
  getAgentLocks(agentId) {
    const locks = [];

    for (const [normalizedPath, lock] of this.fileLocks.entries()) {
      if (lock.lockType === 'write') {
        const writeLock = /** @type {FileLock} */ (lock);
        if (writeLock.agentId === agentId) {
          locks.push({
            path: normalizedPath,
            lockType: 'write',
            acquiredAt: writeLock.acquiredAt
          });
        }
      } else {
        const readLockSet = /** @type {ReadLockSet} */ (lock);
        const readerInfo = readLockSet.readers.get(agentId);
        if (readerInfo) {
          locks.push({
            path: normalizedPath,
            lockType: 'read',
            acquiredAt: readerInfo.acquiredAt
          });
        }
      }
    }

    return locks;
  }

  /**
   * Check if acquiring a lock would cause a conflict without actually acquiring it.
   * 
   * @param {string} agentId - ID of the agent
   * @param {string} filePath - Path to the file
   * @param {LockType} lockType - Type of lock to check
   * @returns {ConflictCheckResult} Conflict check result
   * 
   * @example
   * const check = coordinator.wouldConflict('agent-1', '/path/to/file.js', 'write');
   * if (check.conflicts) {
   *   console.log(check.suggestion); // e.g., "Wait for agent-123 to complete"
   * }
   */
  wouldConflict(agentId, filePath, lockType) {
    const normalizedPath = this._normalizePath(filePath);
    const currentLock = this.fileLocks.get(normalizedPath);
    const canAcquire = this._canAcquireLock(currentLock, agentId, lockType);

    if (canAcquire.allowed) {
      return { conflicts: false };
    }

    let suggestion = '';
    if (canAcquire.conflictingAgent) {
      suggestion = `Wait for ${canAcquire.conflictingAgent} to complete`;
      
      // Check if there's a queue
      const queue = this.taskQueue.get(normalizedPath);
      if (queue && queue.length > 0) {
        suggestion += ` (${queue.length} agent(s) already waiting)`;
      }
    }

    return {
      conflicts: true,
      reason: canAcquire.reason,
      conflictingAgent: canAcquire.conflictingAgent,
      suggestion
    };
  }

  /**
   * Register a new task with its assigned agents.
   * 
   * @param {string} taskId - Unique task identifier
   * @param {string[]} agentIds - Array of agent IDs assigned to the task
   * 
   * @example
   * coordinator.registerTask('task-123', ['agent-1', 'agent-2']);
   */
  registerTask(taskId, agentIds) {
    this.activeTasks.set(taskId, {
      agentIds: new Set(agentIds),
      files: new Set(),
      status: 'active'
    });
    this._debug('Task registered', { taskId, agentIds });
  }

  /**
   * Update the agents assigned to a task.
   * 
   * @param {string} taskId - Task identifier
   * @param {string[]} agentIds - New array of agent IDs
   * 
   * @example
   * coordinator.updateTaskAgents('task-123', ['agent-1', 'agent-2', 'agent-3']);
   */
  updateTaskAgents(taskId, agentIds) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      this._debug('Cannot update non-existent task', { taskId });
      return;
    }

    task.agentIds = new Set(agentIds);
    this._debug('Task agents updated', { taskId, agentIds });
  }

  /**
   * Complete a task and release all associated locks.
   * 
   * @param {string} taskId - Task identifier
   * @returns {{ releasedLocks: number, agentsCleanedUp: string[] }} Cleanup summary
   * 
   * @example
   * const result = coordinator.completeTask('task-123');
   * console.log(`Released ${result.releasedLocks} locks from ${result.agentsCleanedUp.length} agents`);
   */
  completeTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return { releasedLocks: 0, agentsCleanedUp: [] };
    }

    task.status = 'completed';
    const agentsCleanedUp = [...task.agentIds];
    let releasedLocks = 0;

    // Release all locks held by task's agents
    for (const agentId of task.agentIds) {
      const result = this.releaseAllLocks(agentId);
      releasedLocks += result.released.length;
    }

    this._debug('Task completed', { taskId, releasedLocks, agentsCleanedUp });
    return { releasedLocks, agentsCleanedUp };
  }

  /**
   * Get the status of a task.
   * 
   * @param {string} taskId - Task identifier
   * @returns {TaskStatus} Task status information
   * 
   * @example
   * const status = coordinator.getTaskStatus('task-123');
   * if (status.exists && status.status === 'active') {
   *   console.log(`Task has ${status.lockedFiles.length} files locked`);
   * }
   */
  getTaskStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return { exists: false };
    }

    // Collect all locked files for task's agents
    const lockedFiles = new Set();
    for (const agentId of task.agentIds) {
      const agentLocks = this.getAgentLocks(agentId);
      for (const lock of agentLocks) {
        lockedFiles.add(lock.path);
      }
    }

    return {
      exists: true,
      agentIds: [...task.agentIds],
      lockedFiles: [...lockedFiles],
      status: task.status
    };
  }

  /**
   * Get all current conflicts (files with both holders and waiters).
   * 
   * @returns {ActiveConflict[]} Array of active conflicts
   * 
   * @example
   * const conflicts = coordinator.getActiveConflicts();
   * conflicts.forEach(conflict => {
   *   console.log(`File ${conflict.file}: ${conflict.holders.length} holders, ${conflict.waiters.length} waiters`);
   * });
   */
  getActiveConflicts() {
    const conflicts = [];

    for (const [normalizedPath, queue] of this.taskQueue.entries()) {
      if (queue.length === 0) continue;

      const lock = this.fileLocks.get(normalizedPath);
      if (!lock) continue;

      const holders = [];
      if (lock.lockType === 'write') {
        const writeLock = /** @type {FileLock} */ (lock);
        holders.push({ agentId: writeLock.agentId, lockType: 'write' });
      } else {
        const readLockSet = /** @type {ReadLockSet} */ (lock);
        for (const [agentId] of readLockSet.readers) {
          holders.push({ agentId, lockType: 'read' });
        }
      }

      const waiters = queue.map(req => ({
        agentId: req.agentId,
        lockType: req.lockType
      }));

      conflicts.push({
        file: normalizedPath,
        holders,
        waiters
      });
    }

    return conflicts;
  }

  /**
   * Force release locks that have been held longer than the specified age.
   * Useful for cleaning up after crashed agents.
   * 
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {{ released: StaleLockRelease[] }} Released stale locks
   * 
   * @example
   * // Release locks older than 5 minutes
   * const result = coordinator.forceReleaseStaleLocks(5 * 60 * 1000);
   * result.released.forEach(lock => {
   *   console.log(`Released stale lock on ${lock.path} (age: ${lock.age}ms)`);
   * });
   */
  forceReleaseStaleLocks(maxAge) {
    const now = Date.now();
    const released = [];

    for (const [normalizedPath, lock] of this.fileLocks.entries()) {
      if (lock.lockType === 'write') {
        const writeLock = /** @type {FileLock} */ (lock);
        const age = now - writeLock.acquiredAt.getTime();
        if (age > maxAge) {
          const agentId = writeLock.agentId;
          this.releaseLock(agentId, normalizedPath);
          released.push({ path: normalizedPath, agentId, age });
        }
      } else {
        const readLockSet = /** @type {ReadLockSet} */ (lock);
        for (const [agentId, info] of readLockSet.readers) {
          const age = now - info.acquiredAt.getTime();
          if (age > maxAge) {
            this.releaseLock(agentId, normalizedPath);
            released.push({ path: normalizedPath, agentId, age });
          }
        }
      }
    }

    if (released.length > 0) {
      this._debug('Stale locks released', { released });
    }

    return { released };
  }

  /**
   * Clear all state (useful for testing).
   * @private
   */
  _reset() {
    this.fileLocks.clear();
    this.taskQueue.clear();
    this.activeTasks.clear();
    this.removeAllListeners();
  }
}

/**
 * Singleton instance of TaskCoordinator for application-wide use.
 * @type {TaskCoordinator}
 */
export const taskCoordinator = new TaskCoordinator();
