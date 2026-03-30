# AGENTS.md

This guide documents how to develop agents for MOLT-OS.

## Agent Architecture

Agents in MOLT-OS are specialized components that perform specific tasks within the orchestration pipeline.

### Agent Types

1. **Planner Agent**: Analyzes tasks and creates execution plans
2. **Worker Agent**: Executes tasks and manages subagents
3. **Subagent**: Individual task execution units

## Creating a New Agent

### 1. Define Agent Types

```typescript
// src/agents/<agent-name>/types.ts
export interface AgentConfig {
  timeout: number;
  retries: number;
  model: string;
}

export interface AgentInput {
  task: string;
  context: string;
  constraints?: string[];
}

export interface AgentOutput {
  success: boolean;
  result: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 2. Implement Agent

```typescript
// src/agents/<agent-name>/agent.ts
import { AgentConfig, AgentInput, AgentOutput } from "./types.js";

export class AgentNameAgent {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    // Agent implementation
    return { success: true, result: {} };
  }
}
```

### 3. Register Agent

```typescript
// src/agents/<agent-name>/index.ts
export * from "./types.js";
export * from "./agent.js";
```

## Agent Communication

Agents communicate via IPC messages:

```typescript
import { IpcMessageType } from "../ipc/types.js";

interface PlannerMessage {
  type: IpcMessageType.PLAN_REQUEST;
  taskId: string;
  draftPlan: DraftPlan;
  context: string;
}
```

## Context Attachment

Agents receive context through the context system:

```typescript
import { getContext, attachContext } from "../context/index.js";

const context = await getContext("global");
const agentContext = attachContext(input, context);
```

## Tool Execution

Agents can execute tools through the tool system:

```typescript
import { executeTool } from "../tools/index.js";

const result = await executeTool("tool-name", {
  param1: "value1",
  param2: "value2",
});
```

## Error Handling

Agents should handle errors gracefully:

```typescript
import { MoltError, MoltErrorCode } from "../error/types.js";

try {
  await this.execute(input);
} catch (error) {
  if (isMoltError(error)) {
    throw error;
  }
  throw new MoltError({
    code: MoltErrorCode.AGENT_ERROR,
    message: "Agent execution failed",
    cause: error,
  });
}
```

## Testing Agents

```typescript
// src/agents/<agent-name>/agent.test.ts
describe("AgentName", () => {
  it("should execute task", async () => {
    const agent = new AgentNameAgent({ timeout: 30000 });
    const result = await agent.execute({
      task: "test task",
      context: "test context",
    });
    expect(result.success).toBe(true);
  });
});
```

## Agent Configuration

Agents are configured in `config.json`:

```json
{
  "agents": {
    "planner": {
      "timeout": 60000,
      "retries": 3,
      "model": "gpt-4"
    },
    "worker": {
      "timeout": 300000,
      "maxParallel": 5
    }
  }
}
```

## Best Practices

1. **Idempotency**: Agents should produce the same result for the same input
2. **Timeout Handling**: Always respect timeout settings
3. **Progress Reporting**: Report progress for long-running tasks
4. **Cleanup**: Release resources in finally blocks
5. **Logging**: Use structured logging throughout
