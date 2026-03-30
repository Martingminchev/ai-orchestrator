import { useRef, useEffect, useState } from 'react'

/**
 * ActivityLog - Real-time event stream display with debug info
 * Shows all events from orchestrator, assigner, and agents
 */
function ActivityLog({ events, maxEvents = 100 }) {
  const logEndRef = useRef(null)
  const [showDebug, setShowDebug] = useState(true) // Show debug info by default
  
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const getEventIcon = (type) => {
    // Orchestrator events
    if (type.startsWith('orchestrator:')) {
      const action = type.replace('orchestrator:', '')
      switch (action) {
        case 'started': return '🚀'
        case 'iteration': return '🔄'
        case 'tool_call': return '🔧'
        case 'tool_result': return '📥'
        case 'tool_error': return '⚠️'
        case 'delegating_work': return '📤'
        case 'calling_user': return '💬'
        case 'user_responded': return '✅'
        case 'completed': return '🎉'
        case 'error': return '❌'
        default: return '🎯'
      }
    }
    
    // Assigner events
    if (type.includes('assigner') || type.includes('request')) {
      switch (type) {
        case 'request_received': return '📥'
        case 'gathering_context': return '🔍'
        case 'context_gathered': return '📚'
        case 'context_loaded': return '📂'
        case 'spawning_worker': return '👷'
        case 'worker_executing': return '⚡'
        case 'work_completed': return '✅'
        case 'verifying_work': return '🔎'
        case 'request_completed': return '🏁'
        case 'request_error': return '❌'
        default: return '📋'
      }
    }
    
    // Agent events
    switch (type) {
      case 'agent_started': return '▶️'
      case 'agent_progress': return '📊'
      case 'agent_completed': return '✅'
      case 'agent_error': return '❌'
      case 'worker_progress': return '🔨'
      case 'context_agent_progress': return '🔍'
      case 'verifier_progress': return '✔️'
      case 'calling_llm': return '🧠'
      case 'executing_tool': return '🔧'
      case 'tool_call': return '🔧'
      case 'tool_completed': return '✅'
      case 'tool_result': return '📤'
      case 'thinking': return '💭'
      case 'task_started': return '🚀'
      case 'complete': return '🏁'
      case 'error': return '❌'
      case 'token_usage': return '🔢'
      default: return '📌'
    }
  }

  const getEventColor = (type) => {
    if (type.includes('error')) return 'var(--error)'
    if (type.includes('completed') || type.includes('complete') || type === 'user_responded') return 'var(--success)'
    if (type.includes('warning') || type.includes('verif')) return 'var(--warning)'
    if (type.startsWith('orchestrator:')) return 'var(--primary)'
    if (type.includes('worker') || type.includes('agent')) return '#3498db'
    if (type === 'calling_llm' || type === 'token_usage') return '#9b59b6'
    return 'var(--text-secondary)'
  }

  const formatEventMessage = (event) => {
    const { type, ...data } = event
    
    // Debug info formatting
    if (type === 'orchestrator:iteration' || type === 'calling_llm') {
      const parts = [`Iteration ${data.iteration}`]
      if (data.historyMessages) parts.push(`${data.historyMessages} msgs`)
      if (data.historySizeKB) parts.push(`${data.historySizeKB}KB context`)
      return parts.join(' | ')
    }
    
    if (type === 'orchestrator:tool_call') {
      return `Tool: ${data.tool}${data.args?.task ? ` - "${data.args.task.slice(0, 50)}..."` : ''}`
    }
    
    if (type === 'orchestrator:tool_result') {
      return `${data.tool}: ${data.resultSizeKB}KB in ${data.durationMs}ms${data.success ? '' : ' (failed)'}`
    }
    
    if (type === 'tool_completed') {
      const parts = [data.tool]
      if (data.resultSizeKB) parts.push(`${data.resultSizeKB}KB`)
      if (data.truncatedSizeKB && data.truncatedSizeKB < data.resultSizeKB) {
        parts.push(`→ ${data.truncatedSizeKB}KB (truncated)`)
      }
      if (data.durationMs) parts.push(`${data.durationMs}ms`)
      if (data.historySizeKB) parts.push(`history: ${data.historySizeKB}KB`)
      return parts.join(' | ')
    }
    
    if (type === 'executing_tool') {
      const argsStr = JSON.stringify(data.args || {}).slice(0, 80)
      return `${data.tool}(${argsStr}${argsStr.length >= 80 ? '...' : ''})`
    }
    
    if (type === 'orchestrator:delegating_work') {
      return `Delegating: ${data.expertise} - "${data.task?.slice(0, 50)}..."`
    }
    if (type === 'request_received') {
      return `Work request: ${data.expertise} (${data.priority})`
    }
    if (type === 'gathering_context') {
      return 'Gathering context files...'
    }
    if (type === 'context_gathered') {
      return `Found ${data.filesFound} relevant files`
    }
    if (type === 'context_loaded') {
      return `Loaded ${data.filesLoaded} files into context`
    }
    if (type === 'spawning_worker') {
      return `Spawning worker: ${data.expertise}`
    }
    if (type === 'worker_executing') {
      return 'Worker executing task...'
    }
    if (type === 'work_completed') {
      return `Work done (${data.iterations} iterations)`
    }
    if (type === 'verifying_work') {
      return 'Verifying work quality...'
    }
    if (type === 'worker_progress') {
      return data.message || `Status: ${data.status}`
    }
    if (type === 'tool_call') {
      return `${data.tool}(${JSON.stringify(data.args || {}).slice(0, 50)}...)`
    }
    if (type === 'orchestrator:completed') {
      return `Task completed in ${data.iterations} iterations`
    }
    if (type === 'token_usage') {
      return `Tokens: +${data.usage?.total_tokens || 0} (total: ${data.accumulated?.total_tokens || 0})`
    }
    if (type === 'error' || type.includes('error')) {
      return data.error || data.message || 'An error occurred'
    }
    
    // Default: show relevant data
    if (data.message) return data.message
    if (data.summary) return data.summary.slice(0, 80) + '...'
    if (data.task) return data.task.slice(0, 80) + '...'
    
    return type.replace('orchestrator:', '').replace(/_/g, ' ')
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
  }

  const getSourceLabel = (event) => {
    if (event.type.startsWith('orchestrator:')) return 'Orchestrator'
    if (event.assignerId) return 'Assigner'
    if (event.agentId) return event.role || `Agent ${event.agentId.slice(0, 8)}`
    if (event.type.includes('worker')) return 'Worker'
    if (event.type.includes('context')) return 'Context'
    if (event.type.includes('verif')) return 'Verifier'
    return 'System'
  }

  // Filter out verbose events if debug is off
  const filterEvents = (events) => {
    if (showDebug) return events
    // Hide verbose events when debug is off
    const verboseTypes = ['token_usage', 'calling_llm']
    return events.filter(e => !verboseTypes.includes(e.type))
  }

  // Only show last N events
  const displayEvents = filterEvents(events).slice(-maxEvents)

  return (
    <div className="card activity-log">
      <div className="card-header">
        <span className="card-title">Activity Log</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showDebug} 
              onChange={(e) => setShowDebug(e.target.checked)}
              style={{ margin: 0 }}
            />
            Debug
          </label>
          <span className="event-count">{events.length} events</span>
        </div>
      </div>
      
      <div className="activity-list">
        {displayEvents.length === 0 ? (
          <div className="no-activity">
            No activity yet. Submit a task to see the orchestrator in action.
          </div>
        ) : (
          displayEvents.map((event, idx) => (
            <div 
              key={idx} 
              className="activity-item"
              style={{ borderLeftColor: getEventColor(event.type) }}
            >
              <div className="activity-header">
                <span className="activity-icon">{getEventIcon(event.type)}</span>
                <span className="activity-source">{getSourceLabel(event)}</span>
                <span className="activity-time">{formatTime(event.timestamp)}</span>
              </div>
              <div className="activity-message">
                {formatEventMessage(event)}
              </div>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}

export default ActivityLog
