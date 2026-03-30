---
name: system-agent
description: Perform system operations, command execution, and resource monitoring for MOLT-OS
metadata:
  {
    "molt-os":
      {
        "emoji": "⚙️",
        "capabilities":
          [
            "Run shell commands",
            "Execute scripts",
            "Check system status",
            "Monitor resources",
            "Automate tasks",
            "Schedule jobs",
          ],
      },
  }
---

# System Agent

The System Agent handles all system-level operations for MOLT-OS, including command execution, resource monitoring, and task automation.

## Capabilities

- **Run Commands**: Execute shell commands with proper environment handling
- **Execute Scripts**: Run scripts in various languages
- **Check Status**: Verify system and service status
- **Monitor Resources**: Monitor CPU, memory, disk, and network usage
- **Automate Tasks**: Automate repetitive system tasks
- **Schedule Jobs**: Schedule tasks for future execution

## Guidelines

- Always use safe command practices
- Validate inputs before execution
- Handle errors gracefully
- Return structured output
- Consider security implications
- Use proper timeout handling
- Clean up resources after execution

## Tools

### run_command

Run a shell command with proper environment.

**Input:**

```json
{
  "command": "string (required)",
  "args": ["string"],
  "env": object,
  "timeout": number
}
```

**Output:**

```json
{
  "success": true,
  "stdout": "string",
  "stderr": "string",
  "exitCode": number
}
```

### execute_script

Execute a script file.

**Input:**

```json
{
  "path": "string (required)",
  "interpreter": "bash | python | node | powershell",
  "args": ["string"]
}
```

**Output:**

```json
{
  "success": true,
  "output": "string",
  "exitCode": number
}
```

### check_status

Check system and service status.

**Input:**

```json
{
  "target": "system | service | process",
  "name": "string"
}
```

**Output:**

```json
{
  "success": true,
  "status": "running | stopped | error",
  "details": object
}
```

### monitor_resources

Monitor system resources.

**Input:**

```json
{
  "metrics": ["cpu" | "memory" | "disk" | "network"],
  "duration": number,
  "interval": number
}
```

**Output:**

```json
{
  "success": true,
  "metrics": {
    "cpu": number,
    "memory": object,
    "disk": object,
    "network": object
  }
}
```

### automate_tasks

Automate repetitive tasks.

**Input:**

```json
{
  "tasks": [
    {
      "name": "string",
      "command": "string",
      "schedule": "string"
    }
  ]
}
```

**Output:**

```json
{
  "success": true,
  "tasks": ["string"]
}
```

### schedule_jobs

Schedule jobs for future execution.

**Input:**

```json
{
  "command": "string (required)",
  "schedule": "string (cron expression)",
  "params": object
}
```

**Output:**

```json
{
  "success": true,
  "jobId": "string",
  "schedule": "string"
}
```

## Usage Example

```typescript
const agent = new SystemAgent();
const result = await agent.execute({
  id: "task-1",
  agentType: "system",
  prompt: "Run the build script and check system memory usage",
  context: {
    cwd: "/project",
  },
});
```
