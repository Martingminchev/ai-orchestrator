---
name: file-agent
description: Perform file operations and organization for MOLT-OS
metadata:
  {
    "molt-os":
      {
        "emoji": "📁",
        "capabilities":
          [
            "Read, write, move, delete files",
            "List and search directories",
            "Create folder structures",
            "Copy and organize files",
            "Glob pattern matching",
          ],
      },
  }
---

# File Agent

The File Agent handles all file system operations for MOLT-OS, providing safe and efficient file management capabilities.

## Capabilities

- **Read Files**: Read file contents with encoding support
- **Write Files**: Create or overwrite files with automatic directory creation
- **Move/Rename**: Safely move files with directory structure preservation
- **Delete Files**: Safe file deletion with confirmation for destructive operations
- **List Directories**: List directory contents with filtering options
- **Search Files**: Search files using glob patterns
- **Create Directories**: Create directory structures recursively
- **Copy Files**: Copy files with directory structure preservation

## Guidelines

- Always verify paths before destructive operations
- Use glob patterns for efficient file searches
- Maintain file organization patterns
- Handle encoding issues gracefully
- Preserve file permissions when possible
- Report errors with context for debugging

## Tools

### read_file

Read the contents of a file.

**Input:**

```json
{
  "path": "string (required)",
  "encoding": "utf-8 | base64 | binary"
}
```

**Output:**

```json
{
  "success": true,
  "content": "string",
  "metadata": {
    "size": number,
    "modified": string
  }
}
```

### write_file

Write content to a file, creating directories as needed.

**Input:**

```json
{
  "path": "string (required)",
  "content": "string (required)",
  "encoding": "utf-8"
}
```

**Output:**

```json
{
  "success": true,
  "path": "string"
}
```

### move_file

Move or rename a file.

**Input:**

```json
{
  "source": "string (required)",
  "destination": "string (required)"
}
```

**Output:**

```json
{
  "success": true,
  "source": "string",
  "destination": "string"
}
```

### delete_file

Delete a file (with safety checks).

**Input:**

```json
{
  "path": "string (required)",
  "force": boolean
}
```

**Output:**

```json
{
  "success": true,
  "path": "string"
}
```

### list_directory

List contents of a directory.

**Input:**

```json
{
  "path": "string (required)",
  "recursive": boolean,
  "filter": "string (glob pattern)"
}
```

**Output:**

```json
{
  "success": true,
  "entries": [
    {
      "name": "string",
      "path": "string",
      "type": "file | directory",
      "size": number
    }
  ]
}
```

### search_files

Search for files using glob patterns.

**Input:**

```json
{
  "pattern": "string (required)",
  "cwd": "string",
  "recursive": boolean
}
```

**Output:**

```json
{
  "success": true,
  "matches": ["string"]
}
```

### glob

Find files matching a pattern (alias for search_files).

**Input:**

```json
{
  "pattern": "string (required)",
  "baseDir": "string"
}
```

**Output:**

```json
{
  "success": true,
  "files": ["string"]
}
```

### create_directory

Create a directory (recursively if needed).

**Input:**

```json
{
  "path": "string (required)",
  "parents": boolean
}
```

**Output:**

```json
{
  "success": true,
  "path": "string"
}
```

### copy_file

Copy a file to a new location.

**Input:**

```json
{
  "source": "string (required)",
  "destination": "string (required)"
}
```

**Output:**

```json
{
  "success": true,
  "source": "string",
  "destination": "string"
}
```

## Usage Example

```typescript
const agent = new FileAgent();
const result = await agent.execute({
  id: "task-1",
  agentType: "file",
  prompt: "Read the configuration file and list all TypeScript files in the src directory",
  context: {
    cwd: "/project",
    files: ["/project/config.json"],
  },
});
```
