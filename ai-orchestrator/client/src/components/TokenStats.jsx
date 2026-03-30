/**
 * TokenStats - Enhanced token usage display with per-agent breakdown and context tracking
 */
function TokenStats({ stats, isComplete }) {
  const formatNumber = (num) => {
    if (!num && num !== 0) return '0'
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString()
  }

  // Estimate cost (approximate rates for reference)
  const estimateCost = (promptTokens, completionTokens) => {
    // Very rough estimate - adjust based on actual pricing
    const promptRate = 0.001 / 1000  // $0.001 per 1K tokens
    const completionRate = 0.002 / 1000  // $0.002 per 1K tokens
    return (promptTokens * promptRate + completionTokens * completionRate).toFixed(4)
  }

  // Handle tokenTracker format from backend
  const orchestrator = stats?.orchestrator || {}
  const accumulated = stats?.accumulated || {}
  const agents = stats?.agents || []
  const calls = accumulated?.calls || 0
  const contextLimit = stats?.contextLimit || 131072
  const contextPercentage = stats?.contextPercentage || 0
  const contextWarning = stats?.contextWarning || false

  const orchestratorPrompt = orchestrator.prompt_tokens || 0
  const orchestratorCompletion = orchestrator.completion_tokens || 0
  const orchestratorTotal = orchestrator.total_tokens || (orchestratorPrompt + orchestratorCompletion)
  const orchestratorCalls = orchestrator.calls || 0

  const totalPrompt = accumulated.prompt_tokens || 0
  const totalCompletion = accumulated.completion_tokens || 0
  const totalTokens = accumulated.total_tokens || (totalPrompt + totalCompletion)

  const estimatedCost = estimateCost(totalPrompt, totalCompletion)

  return (
    <div className="card token-stats">
      <div className="card-header">
        <span className="card-title">Token Usage</span>
        {isComplete && <span className="complete-badge">Final</span>}
      </div>

      {/* Context Window Progress */}
      <div className="context-window">
        <div className="context-header">
          <span className="context-label">Context Window</span>
          <span className={`context-percentage ${contextWarning ? 'warning' : ''}`}>
            {contextPercentage.toFixed(1)}%
          </span>
        </div>
        <div className="context-progress-container">
          <div 
            className={`context-progress-bar ${contextWarning ? 'warning' : ''}`}
            style={{ width: `${Math.min(contextPercentage, 100)}%` }}
          />
        </div>
        <div className="context-info">
          <span>{formatNumber(totalTokens)} / {formatNumber(contextLimit)}</span>
          {contextWarning && <span className="warning-text">Approaching limit!</span>}
        </div>
      </div>

      <div className="token-overview">
        <div className="token-total">
          <span className="total-number">{formatNumber(totalTokens)}</span>
          <span className="total-label">Total Tokens</span>
        </div>
        <div className="token-breakdown">
          <div className="breakdown-item">
            <span className="breakdown-label">Prompt</span>
            <span className="breakdown-value">{formatNumber(totalPrompt)}</span>
          </div>
          <div className="breakdown-item">
            <span className="breakdown-label">Completion</span>
            <span className="breakdown-value">{formatNumber(totalCompletion)}</span>
          </div>
        </div>
      </div>

      <div className="token-details">
        {/* Orchestrator */}
        <div className="token-row orchestrator">
          <div className="token-row-header">
            <span className="token-icon">🎯</span>
            <span className="token-source">Orchestrator</span>
            <span className="token-calls">({orchestratorCalls} calls)</span>
          </div>
          <div className="token-row-values">
            <span className="token-value primary">{formatNumber(orchestratorTotal)}</span>
            <span className="token-sub">
              {formatNumber(orchestratorPrompt)} / {formatNumber(orchestratorCompletion)}
            </span>
          </div>
        </div>

        {/* Agent breakdown */}
        {agents.length > 0 && (
          <div className="agent-tokens">
            <div className="agent-tokens-header">Agents ({agents.length})</div>
            {agents.map((agent, idx) => (
              <div key={agent.id || idx} className="token-row agent">
                <div className="token-row-header">
                  <span className="token-icon">{getAgentIcon(agent.role)}</span>
                  <span className="token-source">
                    {agent.role || `Agent ${(agent.id || '').slice(0, 6)}`}
                  </span>
                  <span className="token-calls">({agent.calls || 0} calls)</span>
                </div>
                <div className="token-row-values">
                  <span className="token-value">{formatNumber(agent.total_tokens || 0)}</span>
                  <span className="token-sub">
                    {formatNumber(agent.prompt_tokens || 0)} / {formatNumber(agent.completion_tokens || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="token-summary">
        <div className="summary-row">
          <span className="summary-label">API Calls</span>
          <span className="summary-value">{calls}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Est. Cost</span>
          <span className="summary-value cost">${estimatedCost}</span>
        </div>
      </div>

      {/* Visual bar */}
      <div className="token-bar">
        <div 
          className="token-bar-prompt" 
          style={{ width: totalTokens > 0 ? `${(totalPrompt / totalTokens) * 100}%` : '50%' }}
          title={`Prompt: ${formatNumber(totalPrompt)}`}
        />
        <div 
          className="token-bar-completion" 
          style={{ width: totalTokens > 0 ? `${(totalCompletion / totalTokens) * 100}%` : '50%' }}
          title={`Completion: ${formatNumber(totalCompletion)}`}
        />
      </div>
      <div className="token-bar-legend">
        <span className="legend-item prompt">■ Prompt</span>
        <span className="legend-item completion">■ Completion</span>
      </div>
    </div>
  )
}

function getAgentIcon(role) {
  if (!role) return '🤖'
  const r = role.toLowerCase()
  if (r.includes('context')) return '🔍'
  if (r.includes('worker')) return '👷'
  if (r.includes('verifier')) return '✔️'
  if (r.includes('frontend') || r.includes('react')) return '⚛️'
  if (r.includes('backend') || r.includes('api')) return '🔌'
  if (r.includes('design') || r.includes('css')) return '🎨'
  return '🤖'
}

export default TokenStats
