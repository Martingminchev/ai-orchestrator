# AI Orchestrator

Multi-agent task orchestration with parallel execution.

## What This Is

I wanted to explore how multiple AI agents could work together on complex tasks -- not just one model answering a question, but a system that decomposes problems, delegates to specialized agents, and synthesizes their parallel work into a coherent result.

This repo contains two approaches to that idea, built at different levels of abstraction:

1. **ai-orchestrator** -- A working multi-agent system with a web UI, powered by Moonshot's Kimi K2.5, that breaks down user tasks and spawns 2-5 specialized sub-agents working in parallel.
2. **MOLT-OS** -- A more ambitious orchestration framework with a hierarchical CEO-to-Workers-to-Sub-workers architecture, TypeScript throughout, multi-model support, and both CLI and Electron interfaces.

---

## ai-orchestrator

A multi-agent orchestration system with a React frontend and Express backend. You submit a task, the orchestrator analyzes it, spawns specialized agents, and streams their progress in real time.

### How It Works

```
User submits task
       |
       v
  ORCHESTRATOR (Kimi K2.5)
  Analyzes + decomposes task
       |
       v
  ASSIGNER
  Routes subtasks to specialists
       |
       +---> Explorer (research, investigation)
       +---> Analyst (data analysis, patterns)
       +---> Writer (content, documentation)
       +---> Coder (implementation, debugging)
       +---> Reviewer (quality, feedback)
       |
       v
  SUPERVISOR reviews completed work
       |
       v
  ORCHESTRATOR synthesizes final result
```

The orchestrator never does work directly -- it only coordinates through tool calls (`request_work`, `request_supervision`, `call_user`, `complete_task`). Each agent gets a focused context window, which produces better results than stuffing everything into one conversation.

### Key Features

- **Parallel agent execution** -- Up to 5 agents work simultaneously on different subtasks
- **Tool-based coordination** -- Orchestrator delegates via native tool calling, not prompt engineering
- **SSE streaming** -- Real-time progress updates as agents work
- **Agent dashboard** -- Visual tracking of each agent's status and output
- **Token tracking** -- Per-agent and accumulated token usage displayed in the UI
- **User interaction** -- Agents can ask clarifying questions mid-task via `call_user`
- **Cancellation** -- Abort running tasks with proper cleanup

### Tech Stack

- **Backend**: Express.js, Moonshot Kimi K2.5 API, Server-Sent Events
- **Frontend**: React, Vite
- **Architecture**: Event-driven with EventEmitter, in-memory state management

---

## MOLT-OS

MOLT Orchestrator Terminal Operating System -- a hierarchical agent orchestration framework built in TypeScript. This is the more structured, framework-level approach to agent orchestration.

### Architecture

```
CEO ORCHESTRATOR
  |-- Task Router, Model Router, Context Manager, Memory Manager
  |-- Session Manager, Daemon Controller, Skill Engine
  |
  +---> PLANNER
  |     Decomposes tasks, identifies dependencies, creates parallel groups
  |
  +---> WORKERS (parallel)
  |     |-- Code Agent (coding tools, file operations)
  |     |-- Research Agent (search, analysis tools)
  |     |-- File Agent (file system operations)
  |     |-- System Agent (system operations, monitoring)
  |     |
  |     +---> SUB-AGENTS (per worker, for granular tasks)
  |
  +---> CONTEXT SYSTEM
        |-- Global context (.molt/global.md)
        |-- Location context (.molt.md in directories)
        |-- Skill definitions (.molt/skills/*.md)
        |-- Hot-reload on context file changes
```

### Key Features

- **Hierarchical execution** -- CEO orchestrator delegates to workers, workers spawn sub-agents
- **Multi-model support** -- Kimi K2.5, Google Gemini 3.0, MiniMax -- different models for different agent roles
- **File-system context** -- `.molt.md` files provide location-aware context, hot-reloaded via Chokidar
- **Task planning** -- Planner analyzes dependencies and creates parallel execution groups
- **IPC protocol** -- Typed JSON message passing between orchestrator, workers, planner, and sub-agents
- **CLI interface** -- Interactive terminal with Commander.js and Clack prompts
- **Electron UI** -- Desktop dashboard with agent status, task monitoring, config panel
- **Windows daemon** -- Background service via Task Scheduler integration
- **Error recovery** -- Typed error system with recovery strategies and retry logic
- **Memory management** -- SQLite-backed persistent memory across sessions
- **Test suite** -- Unit, integration, and E2E tests with Vitest

### Tech Stack

- **Language**: TypeScript (strict mode, ESM)
- **CLI**: Commander.js, @clack/prompts, Chalk
- **Build**: tsdown, tsx
- **Testing**: Vitest with coverage thresholds
- **Models**: Moonshot Kimi K2.5, Google Gemini, MiniMax
- **Desktop**: Electron (renderer + main process)
- **Validation**: Zod schemas for config and IPC messages
- **File watching**: Chokidar for context hot-reload

---

## How to Run

### ai-orchestrator

```bash
cd ai-orchestrator

# Install dependencies
npm run install:all

# Create .env from example
cp .env.example .env
# Add your Moonshot API key to .env

# Run both server and client
npm run dev

# Open http://localhost:5173
# Enter your API key when prompted, then submit a task
```

### MOLT-OS

```bash
cd molt-os

# Install dependencies (requires pnpm)
pnpm install

# Create .env from example
cp .env.example .env
# Add your Kimi API key to .env

# Run CLI in development mode
pnpm dev

# Run tests
pnpm test

# Build
pnpm build
```

Requires Node.js >= 22.12.0 and pnpm >= 10.0.0.

---

## Project Structure

```
ai-orchestrator/          # Web-based multi-agent system
  server/
    agents/
      orchestrator.js     # Main coordinator (tool-calling loop)
      assigner.js         # Routes work to specialist agents
      workerAgent.js      # Specialist agent implementation
      supervisorAgent.js  # Reviews completed work
      prompts.js          # System prompts for all agent roles
      tools/definitions.js # Tool schemas for orchestrator
    services/
      kimi.js             # Moonshot API client
      tokenTracker.js     # Token usage tracking
    routes/api.js         # Express API routes + SSE streaming
  client/
    src/components/
      Chat.jsx            # Chat interface
      AgentDashboard.jsx  # Agent status display
      TokenStats.jsx      # Token usage display

molt-os/                  # TypeScript orchestration framework
  src/
    orchestrator/         # CEO-level task coordination
    worker/               # Worker agents + sub-agent spawning
    planner/              # Task decomposition + parallel planning
    agents/               # Specialized agent implementations
    context/              # File-system context loading + hot-reload
    config/               # Zod-validated configuration
    ipc/                  # Inter-process communication protocol
    memory/               # SQLite persistent memory
    error/                # Typed error handling + recovery
    cli/                  # Terminal interface
    models/               # LLM provider integrations
    daemon/               # Windows background service
  ui/                     # Electron desktop application
  tests/                  # Integration and E2E tests

docs/
  IMPLEMENTATION_PLAN.md  # Detailed architecture and design decisions
  COMPARISON_TASKS.md     # Example tasks showing orchestrator vs single-agent
```

---

## Project Status

This is an early-stage exploration project, not production software.

- **ai-orchestrator**: ~20% complete. The core orchestration loop works -- task decomposition, parallel agent spawning, result synthesis, and the web UI are functional. Needs better error handling, persistence, and more robust agent lifecycle management.
- **MOLT-OS**: ~70% complete. The TypeScript framework has solid foundations -- orchestrator, worker, planner, and context systems are implemented with typed IPC, config validation, and test coverage. The Electron UI and daemon are scaffolded but need more integration work.

---

## What I Learned

Building these systems taught me that the hard problems in multi-agent orchestration are not about calling LLMs -- they are about **context management** and **coordination overhead**.

The key insight from ai-orchestrator was that agents produce better results when they each get a focused, minimal context rather than sharing one bloated conversation. The orchestrator's "lean coordinator" pattern (never doing work itself, only delegating through tools) keeps the coordination layer from becoming a bottleneck.

With MOLT-OS, I learned that a hierarchical architecture creates natural boundaries for fault isolation -- a failed sub-agent does not take down the whole system, and retry logic can operate at each level independently. The file-system context approach (`.molt.md` files) turned out to be surprisingly effective for providing location-aware context to agents.

The biggest challenge was managing the trade-off between giving agents enough context to do their job and keeping context windows small enough for quality output. The summarization pattern (workers return summaries, orchestrator can request extended details if needed) was the most practical solution I found.

---

## License

MIT
