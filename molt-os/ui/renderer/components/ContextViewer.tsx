import React, { useEffect, useState } from "react";
import { ContextFile } from "../../electron.d";

export default function ContextViewer() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<ContextFile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const fileList = await window.molt.context.getFiles();
      setFiles(fileList);
    } catch (error) {
      console.error("Failed to load context files:", error);
    }
  };

  const handleSelectFile = async (filename: string) => {
    setSelectedFile(filename);
    setLoading(true);

    try {
      const content = await window.molt.context.read(filename);
      setFileContent(content);
    } catch (error) {
      console.error("Failed to read file:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="context-viewer">
      <div className="context-header">
        <h2 className="context-title">Context Viewer</h2>
        <div className="context-actions">
          <button className="btn btn-secondary" onClick={loadFiles}>
            Refresh
          </button>
        </div>
      </div>

      <div className="context-content">
        <div className="context-files">
          <h3 className="files-title">Context Files</h3>
          {files.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">◎</span>
              <p>No context files found</p>
            </div>
          ) : (
            <ul className="file-list">
              {files.map((filename) => (
                <li
                  key={filename}
                  className={`file-item ${selectedFile === filename ? "selected" : ""}`}
                  onClick={() => handleSelectFile(filename)}
                >
                  <span className="file-icon">◎</span>
                  <span className="file-name">{filename}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="context-detail">
          {!selectedFile ? (
            <div className="empty-state">
              <span className="empty-icon">◎</span>
              <p>Select a file to view its contents</p>
            </div>
          ) : loading ? (
            <div className="loading-state">
              <span className="loading-spinner">◌</span>
              <p>Loading...</p>
            </div>
          ) : fileContent ? (
            <>
              <div className="file-header">
                <h3 className="file-title">{fileContent.filename}</h3>
                <span className="file-modified">
                  Modified: {new Date(fileContent.lastModified).toLocaleString()}
                </span>
              </div>
              <div className="file-content">
                <div className="context-summary">
                  <h4>Summary</h4>
                  <p>{fileContent.content.summary || "No summary available"}</p>
                </div>
                <div className="context-items">
                  <h4>Files ({fileContent.content.files.length})</h4>
                  <ul className="item-list">
                    {fileContent.content.files.map((item, index) => (
                      <li key={index} className="context-item">
                        <span className={`item-type ${item.type}`}>
                          {item.type === "file" ? "◎" : "▣"}
                        </span>
                        <span className="item-path">{item.path}</span>
                        <span className="item-size">{formatSize(item.size)}</span>
                        {item.children && (
                          <ul className="item-children">
                            {item.children.map((child, childIndex) => (
                              <li key={childIndex} className="context-item child">
                                <span className={`item-type ${child.type}`}>
                                  {child.type === "file" ? "◎" : "▣"}
                                </span>
                                <span className="item-path">{child.path}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="error-state">
              <span className="error-icon">!</span>
              <p>Failed to load file content</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
