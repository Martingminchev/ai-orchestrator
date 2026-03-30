import React from "react";
import Dashboard from "./components/Dashboard";
import ConfigPanel from "./components/ConfigPanel";
import TaskMonitor from "./components/TaskMonitor";
import ContextViewer from "./components/ContextViewer";
import AgentStatus from "./components/AgentStatus";
import { useUIStore } from "./store";

function App() {
  const { activeView } = useUIStore();

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">◆</span>
          <span className="logo-text">MOLT-OS</span>
        </div>
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => useUIStore.getState().setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-tab ${activeView === "tasks" ? "active" : ""}`}
            onClick={() => useUIStore.getState().setView("tasks")}
          >
            Tasks
          </button>
          <button
            className={`nav-tab ${activeView === "context" ? "active" : ""}`}
            onClick={() => useUIStore.getState().setView("context")}
          >
            Context
          </button>
          <button
            className={`nav-tab ${activeView === "config" ? "active" : ""}`}
            onClick={() => useUIStore.getState().setView("config")}
          >
            Config
          </button>
        </nav>
        <div className="header-actions">
          <span className="status-indicator online"></span>
          <span className="status-text">Connected</span>
        </div>
      </header>

      <main className="app-content">
        {activeView === "dashboard" && <Dashboard />}
        {activeView === "tasks" && <TaskMonitor />}
        {activeView === "context" && <ContextViewer />}
        {activeView === "config" && <ConfigPanel />}
      </main>

      {activeView === "dashboard" && <AgentStatus />}
    </div>
  );
}

export default App;
