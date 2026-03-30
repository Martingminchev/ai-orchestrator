import { useState, useRef, useEffect } from 'react'
import UserPrompt from './UserPrompt'

/**
 * Generate a unique project name based on task description
 * Format: task-{slug}-{shortId}
 * Example: "Add dark mode" → "task-add-dark-mode-a7f3"
 */
const generateProjectName = (taskDescription) => {
  // Take first 7 words, convert to slug
  const words = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .split(/\s+/)
    .slice(0, 7);
  
  const slug = words.join('-').substring(0, 40);
  
  // Generate 4-char random hex suffix
  const randomId = Math.random().toString(16).substring(2, 6);
  
  return `task-${slug}-${randomId}`;
};

/**
 * Chat component - Main interface with comprehensive event handling
 */
function Chat({ 
  onAgentUpdate, 
  onOrchestratorData,
  onTokenUpdate, 
  onNewTask, 
  onEvent,
  onOrchestratorStatus,
  disabled 
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [userInteraction, setUserInteraction] = useState(null)
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const messagesEndRef = useRef(null)
  const eventSourceRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!input.trim() || loading || disabled) return

    const userMessage = input.trim()
    setInput('')
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    
    // Notify parent to clear previous task data
    onNewTask()
    
    setLoading(true)

    try {
      // Generate unique project name
      const projectName = generateProjectName(userMessage)
      
      // POST to create task
      const response = await fetch('/api/task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          task: userMessage,
          projectName: projectName
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create task')
      }

      const { taskId } = await response.json()
      setCurrentTaskId(taskId)
      
      // Connect to SSE stream
      connectToStream(taskId)
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'error', 
        content: err.message || 'Failed to send message' 
      }])
      setLoading(false)
    }
  }

  const connectToStream = (taskId) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setStreaming(true)
    let assistantMessage = ''
    let messageIndex = -1

    // Add initial assistant message placeholder
    setMessages(prev => {
      messageIndex = prev.length
      return [...prev, { role: 'assistant', content: '', streaming: true, label: 'Orchestrator' }]
    })

    // Update orchestrator status
    onOrchestratorStatus?.({ status: 'running', iteration: 0 })

    const eventSource = new EventSource(`/api/stream/${taskId}`)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Forward all events to parent for ActivityLog
        onEvent?.(data)
        
        // Handle specific event types
        switch (data.type) {
          case 'task_started':
            assistantMessage = '🚀 Starting task analysis...'
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          // Orchestrator events
          case 'orchestrator:started':
            assistantMessage = '🎯 Orchestrator initialized. Planning approach...'
            updateAssistantMessage(messageIndex, assistantMessage)
            onOrchestratorStatus?.({ status: 'running', iteration: 0 })
            // Store system prompt and tools
            if (data.systemPrompt) {
              onOrchestratorData?.({ systemPrompt: data.systemPrompt })
            }
            break

          case 'orchestrator:iteration':
            onOrchestratorStatus?.({ status: 'running', iteration: data.iteration })
            break

          case 'orchestrator:thinking':
            // Orchestrator's reasoning/thinking content
            onOrchestratorData?.({ 
              thinking: { 
                content: data.content, 
                iteration: data.iteration 
              } 
            })
            break

          case 'orchestrator:tool_call':
            onOrchestratorStatus?.({ 
              status: 'running', 
              iteration: data.iteration,
              currentTool: data.tool 
            })
            // Store tool call
            onOrchestratorData?.({ 
              toolCall: { 
                tool: data.tool, 
                args: data.args, 
                iteration: data.iteration 
              } 
            })
            if (data.tool === 'request_work') {
              assistantMessage = `📤 Delegating work: ${data.args?.expertise || 'specialist'}\n\nTask: ${data.args?.task || '...'}`
              updateAssistantMessage(messageIndex, assistantMessage)
            } else if (data.tool === 'complete_task') {
              assistantMessage = `🎉 Task completing...\n\n${data.args?.summary || ''}`
              updateAssistantMessage(messageIndex, assistantMessage)
            }
            break

          case 'orchestrator:tool_result':
            // Store tool result
            onOrchestratorData?.({ 
              toolResult: { 
                tool: data.tool, 
                result: data.result,
                success: data.success,
                durationMs: data.durationMs,
                iteration: data.iteration 
              } 
            })
            break

          case 'orchestrator:delegating_work':
            assistantMessage = `📋 Assigning work to ${data.expertise}...\n\nTask: ${data.task}`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'orchestrator:completed':
            onOrchestratorStatus?.({ status: 'completed', iteration: data.iteration })
            break

          case 'orchestrator:error':
            onOrchestratorStatus?.({ status: 'error' })
            break

          // Research/Improvement events
          case 'orchestrator:requesting_improvement':
            assistantMessage = `📚 Researching: ${data.topic || 'topic'}...`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'improvement_progress':
            // Update with research progress
            if (data.message) {
              assistantMessage = `📚 ${data.message}`
              updateAssistantMessage(messageIndex, assistantMessage)
            }
            break

          // Agent lifecycle events
          case 'calling_llm':
            onAgentUpdate({
              id: data.agentId,
              status: 'thinking',
              currentAction: 'Processing...'
            })
            break

          case 'executing_tool':
            onAgentUpdate({
              id: data.agentId,
              status: 'running',
              currentAction: `Running ${data.tool}...`,
              toolCalls: [{ tool: data.tool, args: data.args, iteration: data.iteration }]
            })
            break

          case 'tool_completed':
            onAgentUpdate({
              id: data.agentId,
              status: 'running',
              currentAction: `${data.tool} completed`,
              toolCalls: [{ 
                tool: data.tool, 
                result: data.result,
                success: data.success,
                durationMs: data.durationMs,
                iteration: data.iteration 
              }]
            })
            break

          case 'tool_error':
            // Tool errors are recoverable - just update agent status
            console.warn(`[SSE] Tool error in ${data.agentId || 'unknown'}:`, data.error)
            onAgentUpdate({
              id: data.agentId,
              status: 'warning',
              currentAction: `Tool error: ${data.error?.substring(0, 50) || 'unknown'}`
            })
            break

          // Agent-level errors (recoverable - the orchestrator continues)
          case 'agent_error':
            console.warn(`[SSE] Agent error:`, data.agentId, data.error)
            onAgentUpdate({
              id: data.agentId,
              status: 'error',
              error: data.error?.substring(0, 100)
            })
            break

          // Request/work errors (recoverable)
          case 'request_error':
            console.warn(`[SSE] Request error:`, data.requestId, data.error)
            // This is recoverable - the orchestrator will handle it
            break

          // Assigner events
          case 'request_received':
            onAgentUpdate({
              id: data.requestId,
              role: data.expertise,
              status: 'pending',
              task: data.task
            })
            break

          case 'gathering_context':
            assistantMessage = `🔍 Gathering context for the task...`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'context_gathered':
            assistantMessage = `📚 Found ${data.filesFound} relevant files\n\n${data.summary || ''}`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'spawning_worker':
            assistantMessage = `👷 Spawning worker: ${data.expertise}`
            updateAssistantMessage(messageIndex, assistantMessage)
            onAgentUpdate({
              id: `worker-${Date.now()}`,
              role: data.expertise,
              status: 'pending',
              task: data.task || 'Assigned task'
            })
            break

          case 'worker_executing':
            onAgentUpdate({
              id: data.requestId,
              status: 'running'
            })
            break

          case 'work_completed':
            onAgentUpdate({
              id: data.agentId,
              status: 'complete',
              iterations: data.iterations
            })
            break

          case 'verifying_work':
            assistantMessage = `✔️ Verifying work quality...`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'request_completed':
            assistantMessage = `✅ Work completed\n\n${data.summary || ''}`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          // Agent-specific events
          case 'agent_started':
            onAgentUpdate({
              id: data.agentId,
              role: data.role || data.expertise,
              status: 'running',
              task: data.task,
              systemPrompt: data.systemPrompt,
              tools: data.tools,
              thinking: [],
              toolCalls: []
            })
            break

          case 'agent_thinking':
            // Worker agent's thinking/reasoning
            onAgentUpdate({
              id: data.agentId,
              thinking: [{ content: data.content, iteration: data.iteration }]
            })
            break

          case 'agent_progress':
          case 'worker_progress':
            onAgentUpdate({
              id: data.agentId,
              status: data.status || 'working',
              currentAction: data.message,
              progress: data.percentage
            })
            break

          case 'agent_completed':
            onAgentUpdate({
              id: data.agentId,
              status: 'complete',
              result: data.resultPreview,
              duration: data.duration,
              iterations: data.iterations
            })
            break

          // Context agent events
          case 'context_agent_progress':
            onAgentUpdate({
              id: data.agentId || 'context-agent',
              role: 'Context Agent',
              status: 'running',
              currentAction: 'Discovering files...'
            })
            break

          // Context gathering events
          case 'context_loaded':
            assistantMessage = `📂 Context loaded: ${data.filesLoaded || 0} files ready`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'context_trimmed':
            // Context was trimmed to fit limits - informational
            console.log(`[Context] Trimmed from ${data.originalCount} to ${data.trimmedCount} files`)
            break

          // Supervision events
          case 'orchestrator:requesting_supervision':
            assistantMessage = `🔍 Reviewing work: ${data.scope || 'completed tasks'}...`
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'supervision_progress':
            if (data.message) {
              assistantMessage = `🔍 ${data.message}`
              updateAssistantMessage(messageIndex, assistantMessage)
            }
            break

          // Token updates
          case 'token_update':
            onTokenUpdate(data.tokens)
            break

          // Individual agent token usage (different from aggregated token_update)
          case 'token_usage':
            // Forward accumulated tokens if available
            if (data.accumulated) {
              onTokenUpdate(prev => ({
                ...prev,
                agents: prev.agents ? [...prev.agents.filter(a => a.id !== data.agentId), {
                  id: data.agentId,
                  role: data.role,
                  ...data.accumulated
                }] : [{
                  id: data.agentId,
                  role: data.role,
                  ...data.accumulated
                }]
              }))
            }
            break

          // User interaction
          case 'user_interaction':
            setUserInteraction({
              message: data.message,
              expectResponse: data.expectResponse !== false,
              options: data.options || [],
              type: data.type || 'question'
            })
            break

          // Legacy event handling for backwards compatibility
          case 'thinking':
            assistantMessage = data.message || 'Thinking...'
            updateAssistantMessage(messageIndex, assistantMessage)
            break

          case 'spawning_agents':
            const agentList = (data.agents || []).map(a => a.role).join(', ')
            assistantMessage = `🤖 Spawning ${data.agentCount} agents: ${agentList}\n\nReasoning: ${data.reasoning || 'Delegating subtasks...'}`
            updateAssistantMessage(messageIndex, assistantMessage)
            ;(data.agents || []).forEach(agent => {
              onAgentUpdate({
                id: agent.id,
                role: agent.role,
                status: 'pending',
                task: agent.task
              })
            })
            break

          case 'synthesizing':
            assistantMessage = `🔄 All agents complete (${data.successCount}/${data.agentCount} successful). Synthesizing final response...`
            updateAssistantMessage(messageIndex, assistantMessage, true)
            break

          case 'result':
            // Final result - add as new message
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: data.result,
              label: 'Final Answer'
            }])
            break

          case 'complete':
            setStreaming(false)
            setLoading(false)
            // Mark streaming message as complete and update with final content if available
            setMessages(prev => {
              const updated = [...prev]
              if (updated[messageIndex]) {
                // If we have a result summary (e.g., from direct response), show it
                const finalContent = data.result?.summary || updated[messageIndex].content
                updated[messageIndex] = { 
                  ...updated[messageIndex], 
                  content: finalContent,
                  streaming: false
                }
              }
              return updated
            })
            // Update final token stats
            if (data.tokens) {
              onTokenUpdate(data.tokens)
            }
            onOrchestratorStatus?.({ status: 'completed' })
            eventSource.close()
            break

          case 'error':
            // Check if this is a fatal error (task-level) or a recoverable agent error
            // Fatal errors: have fatal:true, or no agentId and not marked recoverable
            const isFatalError = data.fatal || (!data.agentId && !data.recoverable);
            
            // Check for specific error types and make them user-friendly
            let errorMessage = data.error || data.message || 'An error occurred';
            
            // Make context overflow errors more user-friendly
            if (errorMessage.includes('Message size') && errorMessage.includes('exceeds limit')) {
              errorMessage = '⚠️ The task generated too much context. Try breaking it into smaller, more specific tasks.';
            } else if (errorMessage.includes('API') && errorMessage.includes('error')) {
              errorMessage = `⚠️ API Error: ${errorMessage}`;
            }
            
            if (isFatalError) {
              // Fatal error - show error and close connection
              setMessages(prev => [...prev, {
                role: 'error',
                content: errorMessage
              }])
              setStreaming(false)
              setLoading(false)
              onOrchestratorStatus?.({ status: 'error' })
              eventSource.close()
            } else {
              // Recoverable agent error - just log it, don't close connection
              console.warn('[SSE] Agent error (recoverable):', errorMessage)
              // Update the agent status to show there was an issue
              if (data.agentId) {
                onAgentUpdate({
                  id: data.agentId,
                  status: 'error',
                  error: errorMessage.substring(0, 100)
                })
              }
            }
            break

          case 'cancelled':
            setMessages(prev => [...prev, {
              role: 'system',
              content: '🚫 Task cancelled'
            }])
            setStreaming(false)
            setLoading(false)
            onOrchestratorStatus?.({ status: 'cancelled' })
            eventSource.close()
            break

          default:
            // Log unknown events for debugging
            console.log('[SSE] Unknown event:', data.type, data)
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err)
      }
    }

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err)
      setMessages(prev => [...prev, {
        role: 'error',
        content: 'Connection lost. Please try again.'
      }])
      setStreaming(false)
      setLoading(false)
      onOrchestratorStatus?.({ status: 'error' })
      eventSource.close()
    }
  }

  const updateAssistantMessage = (index, content, keepStreaming = true) => {
    setMessages(prev => {
      const updated = [...prev]
      if (updated[index]) {
        updated[index] = { 
          ...updated[index], 
          content,
          streaming: keepStreaming
        }
      }
      return updated
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleUserResponse = (response) => {
    setMessages(prev => [...prev, {
      role: 'user',
      content: response,
      label: 'Your Response'
    }])
    setUserInteraction(null)
  }

  const handleUserDismiss = () => {
    setUserInteraction(null)
  }

  const handleCancel = async () => {
    if (!currentTaskId) return
    
    try {
      await fetch(`/api/cancel/${currentTaskId}`, { method: 'POST' })
    } catch (err) {
      console.error('Failed to cancel task:', err)
    }
  }

  return (
    <div className="chat-container">
      {userInteraction && currentTaskId && (
        <UserPrompt
          taskId={currentTaskId}
          interaction={userInteraction}
          onRespond={handleUserResponse}
          onDismiss={handleUserDismiss}
        />
      )}
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🎯</div>
            <h2>AI Orchestrator</h2>
            <p>Describe a complex task and I'll orchestrate multiple AI agents to solve it.</p>
            <div className="welcome-hints">
              <span className="hint">💡 Try: "Create a React component for user authentication"</span>
              <span className="hint">💡 Try: "Build a REST API with Express and MongoDB"</span>
              <span className="hint">💡 Try: "Design a landing page for a SaaS product"</span>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              {msg.label && <div className="message-label">{msg.label}</div>}
              <div className="message-content">
                {msg.content}
                {msg.streaming && (
                  <span className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Configure API key to start...' : 'Describe your task...'}
          disabled={disabled || loading}
          rows={1}
        />
        {streaming ? (
          <button
            type="button"
            className="cancel-btn"
            onClick={handleCancel}
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            className="send-btn"
            disabled={disabled || loading || !input.trim()}
          >
            {loading ? 'Working...' : 'Send'}
          </button>
        )}
      </form>
    </div>
  )
}

export default Chat
