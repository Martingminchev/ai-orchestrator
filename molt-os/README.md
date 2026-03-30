# MOLT-OS

MOLT-OS (MOLT Orchestrator Terminal Operating System) is a modern, modular LLM orchestration framework built with TypeScript and Electron.

## Features

- **Modular Architecture**: Clean separation between Orchestrator, Worker, Planner, and Subagent components
- **Multi-Model Support**: Flexible configuration for different LLM providers
- **Hierarchical Context**: Global and local context management with skill-based context loading
- **IPC Communication**: Efficient inter-process communication between components
- **CLI & GUI**: Command-line interface and Electron-based desktop application
- **Windows Daemon**: Background service support with Task Scheduler integration

## Getting Started

### Prerequisites

- Node.js >= 22.12.0
- pnpm >= 10.0.0

### Installation

```bash
cd molt-os
pnpm install
pnpm build
```

### Development

```bash
# Run CLI
pnpm dev

# Run Electron UI
pnpm electron:dev

# Run tests
pnpm test

# Lint and format
pnpm check
```

### Building

```bash
# Build TypeScript
pnpm build

# Build Electron app
pnpm electron:build
```

## Project Structure

```
molt-os/
├── src/
│   ├── cli.ts          # CLI entry point
│   ├── electron.ts     # Electron entry point
│   ├── daemon.ts       # Daemon entry point
│   ├── index.ts        # Unified entry point
│   ├── error/          # Error handling
│   ├── memory/         # Memory management
│   ├── utils/          # Utilities (logger, etc.)
│   ├── context/        # Context loading
│   ├── orchestrator/   # Orchestrator component
│   ├── worker/         # Worker component
│   ├── planner/        # Planner component
│   ├── ipc/            # IPC definitions
│   └── daemon/         # Windows daemon (schtasks)
├── tests/
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/            # End-to-end tests
├── ui/                 # Electron UI
└── docs/               # Additional documentation
```

## Usage

### CLI Commands

```bash
# Initialize configuration
molt-os init

# Check status
molt-os status

# Manage configuration
molt-os config get <key>
molt-os config set <key> <value>

# Run a task
molt-os run <task-name>

# Check for updates
molt-os check-update
```

### Configuration

Configuration is managed through `config.json` or environment variables:

```json
{
  "models": {
    "default": "gpt-4",
    "planner": "gpt-4"
  },
  "paths": {
    "context": "./context",
    "skills": "./skills",
    "output": "./output"
  },
  "orchestrator": {
    "port": 3002
  }
}
```

## Architecture

### Components

1. **Orchestrator**: Central task coordinator and IPC router
2. **Worker**: Task executor and subagent manager
3. **Planner**: Task planning and refinement
4. **Subagent**: Individual task execution units

### Context System

- **Global Context**: `.molt/global.md` - Project-wide context
- **Location Context**: `.molt.md` in directories - Local context
- **Skills**: `skills/*.md` - Reusable skill definitions

### IPC Protocol

Components communicate via JSON messages:

```typescript
interface IpcMessage {
  type: IpcMessageType;
  taskId: string;
  payload: unknown;
  timestamp: number;
  messageId: string;
  source: "orchestrator" | "worker" | "planner" | "subagent";
  target: "orchestrator" | "worker" | "planner" | "subagent";
}
```

## Documentation

- [CLAUDE.md](CLAUDE.md) - Agent guidelines
- [AGENTS.md](AGENTS.md) - Agent development guide
- [docs/](docs/) - Additional documentation

## License

MIT
