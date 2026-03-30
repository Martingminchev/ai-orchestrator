import { useState, useEffect } from 'react'
import ApiKeyModal from './components/ApiKeyModal'
import Chat from './components/Chat'
import AgentDashboard from './components/AgentDashboard'
import TokenStats from './components/TokenStats'
import ActivityLog from './components/ActivityLog'

function App() {
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [events, setEvents] = useState([])
  const [orchestratorStatus, setOrchestratorStatus] = useState({ status: 'idle' })
  const [orchestratorData, setOrchestratorData] = useState({
    thinking: [],
    toolCalls: [],
    systemPrompt: ''
  })
  const [isTaskComplete, setIsTaskComplete] = useState(false)
  const [tokenStats, setTokenStats] = useState({
    orchestrator: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0 },
    agents: [],
    accumulated: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0 },
    contextLimit: 131072,
    contextPercentage: 0,
    contextWarning: false,
    callHistory: []
  })

  useEffect(() => {
    checkApiKey()
  }, [])

  const checkApiKey = async () => {
    try {
      const response = await fetch('/api/config')
      const data = await response.json()
      setHasApiKey(data.hasApiKey)
      if (!data.hasApiKey) {
        setShowApiKeyModal(true)
      }
    } catch (error) {
      console.error('Failed to check API key:', error)
      setShowApiKeyModal(true)
    } finally {
      setLoading(false)
    }
  }

  const handleApiKeySaved = () => {
    setHasApiKey(true)
    setShowApiKeyModal(false)
  }

  const handleAgentUpdate = (agentData) => {
    setAgents(prev => {
      const existing = prev.find(a => a.id === agentData.id)
      if (existing) {
        // Merge arrays like thinking and toolCalls
        const merged = { ...existing, ...agentData }
        if (agentData.thinking && existing.thinking) {
          merged.thinking = [...existing.thinking, ...agentData.thinking.filter(t => 
            !existing.thinking.some(et => et.iteration === t.iteration && et.content === t.content)
          )]
        }
        if (agentData.toolCalls && existing.toolCalls) {
          merged.toolCalls = [...existing.toolCalls, ...agentData.toolCalls.filter(tc =>
            !existing.toolCalls.some(etc => etc.tool === tc.tool && etc.iteration === tc.iteration)
          )]
        }
        return prev.map(a => a.id === agentData.id ? merged : a)
      }
      return [...prev, { 
        ...agentData, 
        thinking: agentData.thinking || [],
        toolCalls: agentData.toolCalls || []
      }]
    })
  }

  const handleOrchestratorData = (data) => {
    setOrchestratorData(prev => {
      const updated = { ...prev }
      
      if (data.systemPrompt) {
        updated.systemPrompt = data.systemPrompt
      }
      
      if (data.thinking) {
        // Add thinking if not duplicate
        const exists = prev.thinking.some(t => 
          t.iteration === data.thinking.iteration && t.content === data.thinking.content
        )
        if (!exists) {
          updated.thinking = [...prev.thinking, data.thinking]
        }
      }
      
      if (data.toolCall) {
        updated.toolCalls = [...prev.toolCalls, data.toolCall]
      }
      
      if (data.toolResult) {
        // Update the last tool call with its result
        const lastCallIdx = updated.toolCalls.length - 1
        if (lastCallIdx >= 0 && updated.toolCalls[lastCallIdx].tool === data.toolResult.tool) {
          updated.toolCalls[lastCallIdx] = {
            ...updated.toolCalls[lastCallIdx],
            result: data.toolResult.result,
            success: data.toolResult.success,
            durationMs: data.toolResult.durationMs
          }
        }
      }
      
      return updated
    })
  }

  const handleTokenUpdate = (stats) => {
    setTokenStats(stats)
  }

  const handleEvent = (event) => {
    setEvents(prev => [...prev, event])
  }

  const handleOrchestratorStatus = (status) => {
    setOrchestratorStatus(prev => ({ ...prev, ...status }))
    if (status.status === 'completed' || status.status === 'error') {
      setIsTaskComplete(true)
    }
  }

  const handleNewTask = () => {
    setAgents([])
    setEvents([])
    setIsTaskComplete(false)
    setOrchestratorStatus({ status: 'idle' })
    setOrchestratorData({
      thinking: [],
      toolCalls: [],
      systemPrompt: ''
    })
    setTokenStats({
      orchestrator: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0 },
      agents: [],
      accumulated: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0 },
      contextLimit: 131072,
      contextPercentage: 0,
      contextWarning: false,
      callHistory: []
    })
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading AI Orchestrator...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>🎯 AI Orchestrator</h1>
          <span className={`status-indicator ${orchestratorStatus.status}`}>
            {orchestratorStatus.status === 'running' && '● Running'}
            {orchestratorStatus.status === 'completed' && '● Complete'}
            {orchestratorStatus.status === 'error' && '● Error'}
            {orchestratorStatus.status === 'idle' && '○ Ready'}
          </span>
        </div>
        <button 
          className="settings-btn"
          onClick={() => setShowApiKeyModal(true)}
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      <main className="main-content">
        <div className="left-panel">
          <div className="chat-section">
            <Chat 
              onAgentUpdate={handleAgentUpdate}
              onOrchestratorData={handleOrchestratorData}
              onTokenUpdate={handleTokenUpdate}
              onNewTask={handleNewTask}
              onEvent={handleEvent}
              onOrchestratorStatus={handleOrchestratorStatus}
              disabled={!hasApiKey}
            />
          </div>
        </div>
        
        <div className="right-panel">
          <div className="panel-section agents-section">
            <AgentDashboard 
              agents={agents} 
              orchestratorStatus={orchestratorStatus}
              orchestratorData={orchestratorData}
            />
          </div>
          
          <div className="panel-section tokens-section">
            <TokenStats 
              stats={tokenStats} 
              isComplete={isTaskComplete}
            />
          </div>
          
          <div className="panel-section activity-section">
            <ActivityLog 
              events={events} 
              maxEvents={200}
            />
          </div>
        </div>
      </main>

      {showApiKeyModal && (
        <ApiKeyModal 
          onSave={handleApiKeySaved}
          onClose={() => hasApiKey && setShowApiKeyModal(false)}
          hasExistingKey={hasApiKey}
        />
      )}
    </div>
  )
}

export default App
