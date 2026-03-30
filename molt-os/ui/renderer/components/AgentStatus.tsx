import React, { useEffect, useState } from "react";
import { SystemStatus } from "../../electron.d";

interface Agent {
  name: string;
  status: "idle" | "running" | "error";
  load: number;
  currentTask?: string;
}

export default function AgentStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    loadStatus();

    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const systemStatus = await window.molt.orchestrator.getStatus();
      setStatus(systemStatus);

      if (systemStatus.agents) {
        const agentList = Object.entries(systemStatus.agents).map(([name, data]) => ({
          name,
          status: data.status,
          load: data.load,
          currentTask: (data as any).currentTask,
        }));
        setAgents(agentList);
      }
    } catch (error) {
      console.error("Failed to load status:", error);
    }
  };

  const getStatusColor = (status: Agent["status"]) => {
    switch (status) {
      case "running":
        return "#4ade80";
      case "error":
        return "#f87171";
      default:
        return "#6b7280";
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="agent-status">
      <div className="status-section">
        <h3 className="status-title">System Status</h3>
        <div className="system-info">
          <div className="info-item">
            <span className="info-label">Version</span>
            <span className="info-value">{status?.version || "1.0.0"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Platform</span>
            <span className="info-value">{status?.platform || "unknown"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Uptime</span>
            <span className="info-value">{status ? formatUptime(status.uptime) : "-"}</span>
          </div>
        </div>
      </div>

      <div className="status-section">
        <h3 className="status-title">Agents</h3>
        <div className="agents-grid">
          {agents.map((agent) => (
            <div key={agent.name} className="agent-card">
              <div className="agent-header">
                <span
                  className="agent-status-dot"
                  style={{ backgroundColor: getStatusColor(agent.status) }}
                />
                <span className="agent-name">{agent.name}</span>
              </div>
              <div className="agent-load">
                <div className="load-bar">
                  <div className="load-fill" style={{ width: `${agent.load}%` }} />
                </div>
                <span className="load-text">{agent.load}%</span>
              </div>
              <div className="agent-task">{agent.currentTask || "No active task"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="status-section">
        <h3 className="status-title">Memory Usage</h3>
        {status?.memoryUsage && (
          <div className="memory-info">
            <div className="memory-bar">
              <div
                className="memory-fill"
                style={{
                  width: `${(status.memoryUsage.heapUsed / status.memoryUsage.heapTotal) * 100}%`,
                }}
              />
            </div>
            <div className="memory-stats">
              <span>Used: {formatBytes(status.memoryUsage.heapUsed)}</span>
              <span>Total: {formatBytes(status.memoryUsage.heapTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
