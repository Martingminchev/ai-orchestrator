import React, { useEffect, useState } from "react";
import { useTaskStore } from "../store";

interface StatCard {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

export default function Dashboard() {
  const { tasks } = useTaskStore();
  const [stats, setStats] = useState<StatCard[]>([]);
  const [recentTasks, setRecentTasks] = useState < typeof tasks.slice(0, 5) > [];

  useEffect(() => {
    setRecentTasks(tasks.slice(0, 5));
  }, [tasks]);

  useEffect(() => {
    const runningTasks = tasks.filter((t) => t.status === "running").length;
    const completedTasks = tasks.filter((t) => t.status === "completed").length;
    const failedTasks = tasks.filter((t) => t.status === "failed").length;

    setStats([
      { title: "Running Tasks", value: runningTasks, icon: "▶", color: "#4ade80" },
      { title: "Completed", value: completedTasks, icon: "✓", color: "#60a5fa" },
      { title: "Failed", value: failedTasks, icon: "✕", color: "#f87171" },
      { title: "Total Tasks", value: tasks.length, icon: "◎", color: "#a78bfa" },
    ]);
  }, [tasks]);

  return (
    <div className="dashboard">
      <section className="dashboard-section">
        <h2 className="section-title">System Overview</h2>
        <div className="stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="stat-card">
              <div className="stat-icon" style={{ color: stat.color }}>
                {stat.icon}
              </div>
              <div className="stat-content">
                <span className="stat-value">{stat.value}</span>
                <span className="stat-title">{stat.title}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-header">
          <h2 className="section-title">Recent Tasks</h2>
          <button
            className="btn btn-primary"
            onClick={() => useTaskStore.getState().setView("tasks")}
          >
            View All
          </button>
        </div>
        <div className="tasks-list">
          {recentTasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">◎</span>
              <p>No tasks yet. Start a new task to get began.</p>
            </div>
          ) : (
            recentTasks.map((task) => (
              <div key={task.id} className={`task-item status-${task.status}`}>
                <div className="task-info">
                  <span className="task-name">{task.name}</span>
                  <span className="task-desc">{task.description}</span>
                </div>
                <div className="task-meta">
                  <span className={`task-status status-${task.status}`}>{task.status}</span>
                  <div className="task-progress">
                    <div className="progress-bar" style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="quick-actions">
          <button className="action-card" onClick={() => useTaskStore.getState().setView("tasks")}>
            <span className="action-icon">+</span>
            <span className="action-label">New Task</span>
          </button>
          <button className="action-card" onClick={() => useTaskStore.getState().setView("config")}>
            <span className="action-icon">⚙</span>
            <span className="action-label">Settings</span>
          </button>
          <button
            className="action-card"
            onClick={() => useTaskStore.getState().setView("context")}
          >
            <span className="action-icon">◎</span>
            <span className="action-label">Context</span>
          </button>
        </div>
      </section>
    </div>
  );
}
