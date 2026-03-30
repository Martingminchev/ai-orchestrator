import React, { useEffect, useState } from "react";
import { MoltConfig } from "../../electron.d";
import { useConfigStore } from "../store";

export default function ConfigPanel() {
  const { config, setConfig, saveConfig } = useConfigStore();
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleChange = (path: string[], value: any) => {
    const newConfig = { ...config };
    let current: any = newConfig;

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
    setConfig(newConfig);
    setHasChanges(true);
    setSaveStatus("idle");
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    const result = await saveConfig(config);
    if (result.success) {
      setSaveStatus("saved");
      setHasChanges(false);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else {
      setSaveStatus("error");
    }
  };

  const handleReset = () => {
    setConfig({
      apiKeys: { kimi: "" },
      paths: { workspace: "./workspace", context: "./context", output: "./output" },
      context: { maxFiles: 100, maxTokens: 100000, includePatterns: [], excludePatterns: [] },
      workers: { defaultModel: "kimi", maxConcurrent: 3, timeout: 300000 },
    });
    setHasChanges(true);
    setSaveStatus("idle");
  };

  return (
    <div className="config-panel">
      <div className="config-header">
        <h2 className="config-title">Configuration</h2>
        <div className="config-actions">
          <button className="btn btn-secondary" onClick={handleReset}>
            Reset
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasChanges || saveStatus === "saving"}
          >
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved!"
                : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="config-sections">
        <section className="config-section">
          <h3 className="config-section-title">API Keys</h3>
          <div className="form-group">
            <label className="form-label">Kimi API Key</label>
            <input
              type="password"
              className="form-input"
              value={config.apiKeys.kimi}
              onChange={(e) => handleChange(["apiKeys", "kimi"], e.target.value)}
              placeholder="Enter your Kimi API key"
            />
            <span className="form-hint">Required for AI model interactions</span>
          </div>
        </section>

        <section className="config-section">
          <h3 className="config-section-title">Paths</h3>
          <div className="form-group">
            <label className="form-label">Workspace Directory</label>
            <input
              type="text"
              className="form-input"
              value={config.paths.workspace}
              onChange={(e) => handleChange(["paths", "workspace"], e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Context Directory</label>
            <input
              type="text"
              className="form-input"
              value={config.paths.context}
              onChange={(e) => handleChange(["paths", "context"], e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Output Directory</label>
            <input
              type="text"
              className="form-input"
              value={config.paths.output}
              onChange={(e) => handleChange(["paths", "output"], e.target.value)}
            />
          </div>
        </section>

        <section className="config-section">
          <h3 className="config-section-title">Context Settings</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Max Files</label>
              <input
                type="number"
                className="form-input"
                value={config.context.maxFiles}
                onChange={(e) => handleChange(["context", "maxFiles"], parseInt(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Max Tokens</label>
              <input
                type="number"
                className="form-input"
                value={config.context.maxTokens}
                onChange={(e) => handleChange(["context", "maxTokens"], parseInt(e.target.value))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Include Patterns</label>
            <textarea
              className="form-textarea"
              value={config.context.includePatterns.join("\n")}
              onChange={(e) =>
                handleChange(
                  ["context", "includePatterns"],
                  e.target.value.split("\n").filter(Boolean),
                )
              }
              placeholder="**/*.ts"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Exclude Patterns</label>
            <textarea
              className="form-textarea"
              value={config.context.excludePatterns.join("\n")}
              onChange={(e) =>
                handleChange(
                  ["context", "excludePatterns"],
                  e.target.value.split("\n").filter(Boolean),
                )
              }
              placeholder="**/node_modules/**"
            />
          </div>
        </section>

        <section className="config-section">
          <h3 className="config-section-title">Worker Settings</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Default Model</label>
              <select
                className="form-select"
                value={config.workers.defaultModel}
                onChange={(e) => handleChange(["workers", "defaultModel"], e.target.value)}
              >
                <option value="kimi">Kimi</option>
                <option value="gpt-4">GPT-4</option>
                <option value="claude">Claude</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Max Concurrent</label>
              <input
                type="number"
                className="form-input"
                value={config.workers.maxConcurrent}
                onChange={(e) =>
                  handleChange(["workers", "maxConcurrent"], parseInt(e.target.value))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Timeout (ms)</label>
              <input
                type="number"
                className="form-input"
                value={config.workers.timeout}
                onChange={(e) => handleChange(["workers", "timeout"], parseInt(e.target.value))}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
