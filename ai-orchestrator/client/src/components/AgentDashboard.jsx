import { useState, useEffect, useRef } from 'react'

/**
 * AgentDashboard - Hierarchical view of orchestrator and workers
 * Shows expandable panels with thinking, system prompts, and tool calls
 */
function AgentDashboard({ agents, orchestratorStatus, orchestratorData }) {
  const [expandedSections, setExpandedSections] = useState({
    orchestrator: true,
    workers: true
  })
  const [expandedAgents, setExpandedAgents] = useState(new Set())
  const [expandedDetails, setExpandedDetails] = useState({}) // { agentId: { systemPrompt: false, tools: true, ... } }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const toggleAgent = (agentId) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const toggleDetail = (agentId, detail) => {
    setExpandedDetails(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [detail]: !prev[agentId]?.[detail]
      }
    }))
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'idle': return '○'
      case 'pending': return '◔'
      case 'running': return '●'
      case 'working': return '●'
      case 'complete': return '✓'
      case 'completed': return '✓'
      case 'verified': return '✓'
      case 'error': return '✗'
      case 'cancelled': return '⊘'
      default: return '○'
    }
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'running':
      case 'working':
        return 'running'
      case 'complete':
      case 'completed':
      case 'verified':
        return 'complete'
      case 'error':
        return 'error'
      case 'pending':
        return 'pending'
      default:
        return 'idle'
    }
  }

  const formatDuration = (ms) => {
    if (!ms) return ''
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  }

  // Group agents by type
  const workerAgents = agents.filter(a => 
    a.role?.toLowerCase().includes('worker') || 
    (!a.role?.toLowerCase().includes('context') && 
     !a.role?.toLowerCase().includes('verifier') &&
     !a.role?.toLowerCase().includes('orchestrator') &&
     !a.role?.toLowerCase().includes('assigner'))
  )

  return (
    <div className="agent-dashboard-v2">
      {/* Orchestrator Section */}
      <div className="dashboard-section">
        <div 
          className="section-header"
          onClick={() => toggleSection('orchestrator')}
        >
          <span className="section-icon">{expandedSections.orchestrator ? '▼' : '▶'}</span>
          <span className="section-title">Orchestrator</span>
          <span className={`status-badge ${getStatusClass(orchestratorStatus?.status || 'idle')}`}>
            {getStatusIcon(orchestratorStatus?.status || 'idle')} {orchestratorStatus?.status || 'idle'}
          </span>
        </div>

        {expandedSections.orchestrator && (
          <div className="section-content">
            <OrchestratorPanel 
              status={orchestratorStatus}
              data={orchestratorData}
              expandedDetails={expandedDetails['orchestrator'] || {}}
              onToggleDetail={(detail) => toggleDetail('orchestrator', detail)}
            />
          </div>
        )}
      </div>

      {/* Workers Section */}
      {workerAgents.length > 0 && (
        <div className="dashboard-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('workers')}
          >
            <span className="section-icon">{expandedSections.workers ? '▼' : '▶'}</span>
            <span className="section-title">Workers</span>
            <span className="section-count">{workerAgents.length}</span>
          </div>

          {expandedSections.workers && (
            <div className="section-content">
              {workerAgents.map(agent => (
                <WorkerPanel
                  key={agent.id}
                  agent={agent}
                  expanded={expandedAgents.has(agent.id)}
                  onToggle={() => toggleAgent(agent.id)}
                  expandedDetails={expandedDetails[agent.id] || {}}
                  onToggleDetail={(detail) => toggleDetail(agent.id, detail)}
                  getStatusIcon={getStatusIcon}
                  getStatusClass={getStatusClass}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {agents.length === 0 && !orchestratorData?.thinking?.length && (
        <div className="empty-state">
          <p>No activity yet</p>
          <p className="hint">Submit a task to see the orchestrator in action</p>
        </div>
      )}
    </div>
  )
}

/**
 * Orchestrator Panel - Shows orchestrator's thinking, tool calls, and system prompt
 */
function OrchestratorPanel({ status, data, expandedDetails, onToggleDetail }) {
  const thinkingEndRef = useRef(null)

  useEffect(() => {
    thinkingEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.thinking])

  const thinking = data?.thinking || []
  const toolCalls = data?.toolCalls || []
  const systemPrompt = data?.systemPrompt || ''

  return (
    <div className="agent-panel orchestrator-panel">
      {/* Status bar */}
      {status?.iteration > 0 && (
        <div className="panel-status-bar">
          <span>Iteration {status.iteration}</span>
          {status.currentTool && <span className="current-tool">→ {status.currentTool}</span>}
        </div>
      )}

      {/* Thinking Stream */}
      <div className="panel-section">
        <div 
          className="panel-section-header"
          onClick={() => onToggleDetail('thinking')}
        >
          <span className="section-icon">{expandedDetails.thinking !== false ? '▼' : '▶'}</span>
          <span>Thinking</span>
          {thinking.length > 0 && <span className="count">{thinking.length}</span>}
        </div>
        {expandedDetails.thinking !== false && (
          <div className="thinking-stream">
            {thinking.length === 0 ? (
              <div className="empty-thinking">Waiting for orchestrator...</div>
            ) : (
              thinking.map((thought, idx) => (
                <div key={idx} className="thinking-item">
                  <span className="thinking-iteration">#{thought.iteration}</span>
                  <div className="thinking-content">{thought.content}</div>
                </div>
              ))
            )}
            <div ref={thinkingEndRef} />
          </div>
        )}
      </div>

      {/* Tool Calls */}
      {toolCalls.length > 0 && (
        <div className="panel-section">
          <div 
            className="panel-section-header"
            onClick={() => onToggleDetail('tools')}
          >
            <span className="section-icon">{expandedDetails.tools ? '▼' : '▶'}</span>
            <span>Tool Calls</span>
            <span className="count">{toolCalls.length}</span>
          </div>
          {expandedDetails.tools && (
            <div className="tool-calls-list">
              {toolCalls.map((call, idx) => (
                <ToolCallItem key={idx} call={call} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* System Prompt (collapsed by default) */}
      {systemPrompt && (
        <div className="panel-section">
          <div 
            className="panel-section-header"
            onClick={() => onToggleDetail('systemPrompt')}
          >
            <span className="section-icon">{expandedDetails.systemPrompt ? '▼' : '▶'}</span>
            <span>System Prompt</span>
          </div>
          {expandedDetails.systemPrompt && (
            <div className="system-prompt-content">
              <pre>{systemPrompt}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Worker Panel - Shows individual worker's details
 */
function WorkerPanel({ agent, expanded, onToggle, expandedDetails, onToggleDetail, getStatusIcon, getStatusClass, formatDuration }) {
  const thinkingEndRef = useRef(null)

  useEffect(() => {
    thinkingEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agent.thinking])

  const getRoleIcon = (role) => {
    if (!role) return '🤖'
    const roleLower = role.toLowerCase()
    if (roleLower.includes('frontend') || roleLower.includes('react')) return '⚛️'
    if (roleLower.includes('backend') || roleLower.includes('api')) return '🔌'
    if (roleLower.includes('design') || roleLower.includes('css')) return '🎨'
    if (roleLower.includes('test')) return '🧪'
    if (roleLower.includes('context')) return '🔍'
    if (roleLower.includes('verifier')) return '✔️'
    return '👷'
  }

  return (
    <div className={`worker-panel ${getStatusClass(agent.status)}`}>
      {/* Header */}
      <div className="worker-header" onClick={onToggle}>
        <div className="worker-header-main">
          <span className="worker-icon">{getRoleIcon(agent.role)}</span>
          <div className="worker-info">
            <span className="worker-role">{agent.role || agent.expertise || 'Worker'}</span>
            {agent.currentAction && (
              <span className="worker-action">{agent.currentAction}</span>
            )}
          </div>
        </div>
        <div className="worker-header-status">
          <span className={`status-badge ${getStatusClass(agent.status)}`}>
            {getStatusIcon(agent.status)} {agent.status}
          </span>
          <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {/* Progress bar for running agents */}
      {(agent.status === 'running' || agent.status === 'working') && (
        <div className="worker-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: agent.progress ? `${agent.progress}%` : '100%' }}
            />
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {expanded && (
        <div className="worker-content">
          {/* Task */}
          {agent.task && (
            <div className="worker-task">
              <strong>Task:</strong> {agent.task}
            </div>
          )}

          {/* Stats row */}
          <div className="worker-stats">
            {agent.iterations > 0 && (
              <span className="stat">Iterations: {agent.iterations}</span>
            )}
            {agent.duration && (
              <span className="stat">Duration: {formatDuration(agent.duration)}</span>
            )}
            {agent.tokens && (
              <span className="stat">Tokens: {agent.tokens.toLocaleString()}</span>
            )}
          </div>

          {/* Thinking Stream */}
          {agent.thinking && agent.thinking.length > 0 && (
            <div className="panel-section">
              <div 
                className="panel-section-header"
                onClick={() => onToggleDetail('thinking')}
              >
                <span className="section-icon">{expandedDetails.thinking !== false ? '▼' : '▶'}</span>
                <span>Thinking</span>
                <span className="count">{agent.thinking.length}</span>
              </div>
              {expandedDetails.thinking !== false && (
                <div className="thinking-stream">
                  {agent.thinking.map((thought, idx) => (
                    <div key={idx} className="thinking-item">
                      <span className="thinking-iteration">#{thought.iteration}</span>
                      <div className="thinking-content">{thought.content}</div>
                    </div>
                  ))}
                  <div ref={thinkingEndRef} />
                </div>
              )}
            </div>
          )}

          {/* Tool Calls */}
          {agent.toolCalls && agent.toolCalls.length > 0 && (
            <div className="panel-section">
              <div 
                className="panel-section-header"
                onClick={() => onToggleDetail('tools')}
              >
                <span className="section-icon">{expandedDetails.tools ? '▼' : '▶'}</span>
                <span>Tool Calls</span>
                <span className="count">{agent.toolCalls.length}</span>
              </div>
              {expandedDetails.tools && (
                <div className="tool-calls-list">
                  {agent.toolCalls.map((call, idx) => (
                    <ToolCallItem key={idx} call={call} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* System Prompt (collapsed by default) */}
          {agent.systemPrompt && (
            <div className="panel-section">
              <div 
                className="panel-section-header"
                onClick={() => onToggleDetail('systemPrompt')}
              >
                <span className="section-icon">{expandedDetails.systemPrompt ? '▼' : '▶'}</span>
                <span>System Prompt</span>
              </div>
              {expandedDetails.systemPrompt && (
                <div className="system-prompt-content">
                  <pre>{agent.systemPrompt}</pre>
                </div>
              )}
            </div>
          )}

          {/* Files Modified/Created */}
          {(agent.filesModified?.length > 0 || agent.filesCreated?.length > 0) && (
            <div className="worker-files">
              {agent.filesCreated?.length > 0 && (
                <div className="files-group">
                  <span className="files-label">Created:</span>
                  <div className="files-list">
                    {agent.filesCreated.map((f, i) => (
                      <span key={i} className="file-item created">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {agent.filesModified?.length > 0 && (
                <div className="files-group">
                  <span className="files-label">Modified:</span>
                  <div className="files-list">
                    {agent.filesModified.map((f, i) => (
                      <span key={i} className="file-item modified">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {agent.error && (
            <div className="worker-error">
              <strong>Error:</strong> {agent.error}
            </div>
          )}

          {/* Result */}
          {agent.result && (
            <div className="worker-result">
              <strong>Result:</strong> {agent.result.slice(0, 300)}
              {agent.result.length > 300 && '...'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Tool Call Item - Expandable tool call with args and result
 */
function ToolCallItem({ call }) {
  const [expanded, setExpanded] = useState(false)

  const getToolIcon = (toolName) => {
    if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) return '📄'
    if (toolName.includes('terminal') || toolName.includes('run')) return '💻'
    if (toolName.includes('search')) return '🔍'
    if (toolName.includes('list') || toolName.includes('directory')) return '📁'
    if (toolName.includes('complete') || toolName.includes('mark')) return '✅'
    if (toolName.includes('request') || toolName.includes('work')) return '📤'
    if (toolName.includes('call_user')) return '💬'
    return '🔧'
  }

  const formatResult = (result) => {
    if (!result) return 'No result'
    if (typeof result === 'string') return result
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }

  return (
    <div className={`tool-call-item ${call.success === false ? 'error' : ''}`}>
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{getToolIcon(call.tool)}</span>
        <span className="tool-name">{call.tool}</span>
        {call.durationMs && <span className="tool-duration">{call.durationMs}ms</span>}
        {call.success === false && <span className="tool-error-badge">Error</span>}
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="tool-call-details">
          {call.args && Object.keys(call.args).length > 0 && (
            <div className="tool-args">
              <div className="detail-label">Arguments:</div>
              <pre>{JSON.stringify(call.args, null, 2)}</pre>
            </div>
          )}
          {call.result !== undefined && (
            <div className="tool-result">
              <div className="detail-label">Result:</div>
              <pre>{formatResult(call.result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentDashboard
