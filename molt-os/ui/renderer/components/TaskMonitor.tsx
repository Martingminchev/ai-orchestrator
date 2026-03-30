import React, { useEffect, useState } from "react";
import { Task, TaskConfig } from "../../electron.d";
import { useTaskStore } from "../store";

export default function TaskMonitor() {
  const { tasks, addTask, updateTask, removeTask } = useTaskStore();
  const [filter, setFilter] = useState<"all" | "running" | "completed" | "failed">("all");
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState<TaskConfig>({
    name: "",
    description: "",
    agent: "auto",
    priority: "normal",
  });

  const filteredTasks = tasks.filter((task) => {
    if (filter === "all") return true;
    return task.status === filter;
  });

  const handleStartTask = async () => {
    if (!newTask.name.trim()) return;

    try {
      const result = await window.molt.tasks.start(newTask);
      if (result.taskId) {
        const task: Task = {
          id: result.taskId,
          name: newTask.name,
          description: newTask.description,
          status: "running",
          progress: 0,
          createdAt: new Date().toISOString(),
          agent: newTask.agent,
        };
        addTask(task);
        setNewTask({ name: "", description: "", agent: "auto", priority: "normal" });
        setShowNewTask(false);
      }
    } catch (error) {
      console.error("Failed to start task:", error);
    }
  };

  const handleStopTask = async (taskId: string) => {
    try {
      const result = await window.molt.tasks.stop(taskId);
      if (result.success) {
        updateTask(taskId, { status: "cancelled", completedAt: new Date().toISOString() });
      }
    } catch (error) {
      console.error("Failed to stop task:", error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return "-";
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  return (
    <div className="task-monitor">
      <div className="task-header">
        <h2 className="task-title">Task Monitor</h2>
        <button className="btn btn-primary" onClick={() => setShowNewTask(true)}>
          + New Task
        </button>
      </div>

      {showNewTask && (
        <div className="new-task-form">
          <h3 className="form-title">Create New Task</h3>
          <div className="form-group">
            <label className="form-label">Task Name</label>
            <input
              type="text"
              className="form-input"
              value={newTask.name}
              onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
              placeholder="Enter task name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              placeholder="Describe the task"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Agent</label>
              <select
                className="form-select"
                value={newTask.agent}
                onChange={(e) => setNewTask({ ...newTask, agent: e.target.value })}
              >
                <option value="auto">Auto</option>
                <option value="planner">Planner</option>
                <option value="coder">Coder</option>
                <option value="tester">Tester</option>
                <option value="reporter">Reporter</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select
                className="form-select"
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowNewTask(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleStartTask}
              disabled={!newTask.name.trim()}
            >
              Start Task
            </button>
          </div>
        </div>
      )}

      <div className="task-filters">
        {(["all", "running", "completed", "failed"] as const).map((status) => (
          <button
            key={status}
            className={`filter-btn ${filter === status ? "active" : ""}`}
            onClick={() => setFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="task-list">
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">◎</span>
            <p>No tasks found</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div key={task.id} className={`task-card status-${task.status}`}>
              <div className="task-card-header">
                <div className="task-card-info">
                  <span className="task-name">{task.name}</span>
                  <span className="task-meta-info">
                    {task.agent && <span className="task-agent">{task.agent}</span>}
                    <span className="task-time">{formatDate(task.createdAt)}</span>
                  </span>
                </div>
                <span className={`task-status status-${task.status}`}>{task.status}</span>
              </div>
              <p className="task-description">{task.description}</p>
              <div className="task-card-footer">
                <div className="task-progress-info">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className="progress-text">{task.progress}%</span>
                </div>
                <div className="task-duration">
                  {formatDuration(task.startedAt, task.completedAt)}
                </div>
                {task.status === "running" && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleStopTask(task.id)}>
                    Stop
                  </button>
                )}
                {(task.status === "completed" ||
                  task.status === "failed" ||
                  task.status === "cancelled") && (
                  <button className="btn btn-secondary btn-sm" onClick={() => removeTask(task.id)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
