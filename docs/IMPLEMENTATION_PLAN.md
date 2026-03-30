# MOLT-OS Orchestrator Implementation Plan

## 1. Project Overview & Architecture Diagram

### 1.1 Project Vision

MOLT-OS (MOLT Orchestrator System) is a hierarchical AI agent orchestration platform designed for 24/7 autonomous operation. Inspired by the OpenClaw codebase, it implements a CEO → Workers → Workers hierarchy where a central orchestrator coordinates specialized worker agents across different domains. The system features a file-system-based context system using location-aware `.molt.md` files, supporting multiple AI models including Kimi k2.5, Opus 4.5, Gemini 3.0, and MiniMax 2.1.

The architecture enables self-improvement through a V2 sandbox environment where agents can experiment, learn, and evolve their capabilities. The frontend is built using MERN stack (MongoDB, Express, React, Node.js) with Electron for desktop deployment, providing both web-based and native application experiences.

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MOLT-OS Orchestrator                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CEO Orchestrator (Primary)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │ Task        │  │ Model       │  │ Context     │  │ Memory      │   │   │
│  │  │ Router      │  │ Router      │  │ Manager     │  │ Manager     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │ Session     │  │ Daemon      │  │ Skill       │  │ Sandbox     │   │   │
│  │  │ Manager     │  │ Controller  │  │ Engine      │  │ Manager     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                        │
│                    ▼               ▼               ▼                        │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Worker: Code        │  │  Worker: Research   │  │  Worker: Creative   │ │
│  │  ┌─────────────────┐ │  │  ┌─────────────────┐ │  │  ┌─────────────────┐ │ │
│  │  │ MiniMax 2.1     │ │  │  │ Gemini 3.0       │ │  │  │ Opus 4.5         │ │ │
│  │  │ + Coding Tools  │ │  │  │ + Search Tools   │ │  │  │ + Art Tools      │ │ │
│  │  └─────────────────┘ │  │  └─────────────────┘ │  │  └─────────────────┘ │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                        │
│                    ▼               ▼               ▼                        │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Worker: Data        │  │  Worker: System      │  │  Worker: Kimi        │ │
│  │  ┌─────────────────┐ │  │  ┌─────────────────┐ │  │  ┌─────────────────┐ │ │
│  │  │ MiniMax 2.1     │ │  │  │ Kimi k2.5        │ │  │  │ Kimi k2.5        │ │ │
│  │  │ + DB Tools      │ │  │  │ + Ops Tools      │ │  │  │ + CN Tools       │ │ │
│  │  └─────────────────┘ │  │  └─────────────────┘ │  │  └─────────────────┘ │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         V2 Self-Improvement Sandbox                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │ Experiment  │  │ Code        │  │ Memory      │  │ Evolution   │   │   │
│  │  │ Runner      │  │ Generator   │  │ Optimizer   │  │ Controller  │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Frontend Layer                                │   │
│  │  ┌───────────────────┐  ┌─────────────────────────────────────────┐ │   │
│  │  │   Electron App    │  │        React Dashboard (MERN)            │ │   │
│  │  │  ┌─────────────┐  │  │  ┌─────────────┐  ┌─────────────────┐   │ │   │
│  │  │  │ Main Window │  │  │  │ Express API │  │  MongoDB         │   │ │   │
│  │  │  │ + Renderer │  │  │  │ Server      │  │  Database        │   │ │   │
│  │  │  └─────────────┘  │  │  └─────────────┘  └─────────────────┘   │ │   │
│  │  └───────────────────┘  └─────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Context System                                │   │
│  │  ┌─────────────────────────────────────────────────────────────┐     │   │
│  │  │                    .molt.md Files                           │     │   │
│  │  │  /project/.molt.md      /workspace/.molt.md    /home/.molt.md│     │   │
│  │  │  • Task Context         • Domain Context      • User Context│     │   │
│  │  │  • Model Preferences    • Skills Config         • Preferences │     │   │
│  │  │  • Constraints         • Worker Rules          • History     │     │   │
│  │  └─────────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Core Design Principles

The MOLT-OS architecture adheres to several foundational principles derived from OpenClaw's successful patterns. First, the **Hierarchical Agent Design** implements a clear CEO → Workers → Workers structure where the central orchestrator handles high-level task decomposition and delegation, workers execute specialized tasks within their domains, and sub-workers handle granular operations. This creates natural fault isolation and scaling opportunities.

Second, the **Context-First Architecture** treats context as a first-class citizen through the file-system-based `.molt.md` system. Every directory can contain context files that define task requirements, model preferences, worker capabilities, and operational constraints. This enables location-aware agent behavior where agents automatically adapt to their working environment.

Third, **24/7 Daemon Operation** requires robust process management with checkpoint/resume capabilities, graceful shutdown handling, automatic restart on failure, and health monitoring. The daemon architecture draws from OpenClaw's systemd, launchd, and schtasks backends while adding enhanced resilience features.

Fourth, **Multi-Model Intelligence** leverages the strengths of different AI models for different tasks. Kimi k2.5 handles Chinese language and cultural context, Opus 4.5 manages creative and complex reasoning tasks, Gemini 3.0 provides fast iteration and large context windows, and MiniMax 2.1 delivers efficient coding and data processing capabilities.

Fifth, **Self-Improvement Sandbox** allows agents to experiment in isolated environments, generate new skills through trial and error, optimize memory and context usage, and evolve their prompting strategies over time.

## 2. Directory Structure

### 2.1 Root Directory Layout

```
molt-shop/
├── orchestrator/                    # Main orchestrator project
│   ├── package.json                 # Root package configuration
│   ├── tsconfig.json                # TypeScript configuration
│   ├── pnpm-workspace.yaml          # PNPM workspace configuration
│   ├── .env.example                 # Environment template
│   ├── .gitignore                   # Git ignore rules
│   ├── README.md                    # Project documentation
│   │
│   ├── src/                         # Core source code
│   │   ├── index.ts                 # Entry point
│   │   ├── cli/                     # CLI interface
│   │   ├── orchestrator/            # CEO orchestrator logic
│   │   ├── workers/                 # Worker implementations
│   │   ├── context/                 # Context system
│   │   ├── memory/                  # Memory and RAG system
│   │   ├── models/                  # Model integrations
│   │   ├── sandbox/                 # V2 sandbox
│   │   ├── daemon/                  # Daemon management
│   │   ├── frontend/                 # Electron + React frontend
│   │   ├── shared/                  # Shared utilities
│   │   └── types/                   # TypeScript type definitions
│   │
│   ├── packages/                    # Monorepo packages
│   │   ├── core/                    # Core orchestrator library
│   │   ├── worker-base/             # Base worker class
│   │   ├── model-kimi/              # Kimi k2.5 integration
│   │   ├── model-anthropic/         # Opus 4.5 integration
│   │   ├── model-google/             # Gemini 3.0 integration
│   │   ├── model-minimax/           # MiniMax 2.1 integration
│   │   ├── context-files/           # Context file parser
│   │   ├── sandbox-v2/              # V2 sandbox runtime
│   │   ├── frontend-electron/       # Electron application
│   │   ├── frontend-react/          # React dashboard
│   │   └── api-server/              # Express API server
│   │
│   ├── skills/                      # Skill definitions (markdown-based)
│   │   ├── coding/
│   │   ├── research/
│   │   ├── creative/
│   │   ├── data/
│   │   ├── system/
│   │   └── kimi/
│   │
│   ├── extensions/                 # Plugin extensions
│   │   ├── storage/
│   │   ├── monitoring/
│   │   └── integrations/
│   │
│   ├── apps/                       # Application builds
│   │   ├── cli/
│   │   ├── desktop/
│   │   └── server/
│   │
│   ├── test/                       # Integration tests
│   ├── docs/                       # Documentation
│   ├── scripts/                    # Build and utility scripts
│   └── config/                     # Configuration files
│
├── context/                        # Global context files
│   ├── .molt.md                    # Global configuration
│   ├── workers/                    # Worker definitions
│   └── skills/                     # Skill definitions
│
├── sandbox/                        # V2 Sandbox environments
│   ├── experiments/                 # Active experiments
│   ├── evolved-skills/             # Self-improved skills
│   └── checkpoints/                # State checkpoints
│
└── data/                           # Runtime data
    ├── memory/                     # Vector database
    ├── sessions/                   # Session storage
    ├── logs/                      # Log files
    └── cache/                     # Cache directory
```

### 2.2 Core Source Directory Structure

```
src/
├── index.ts                        # Main entry point
│
├── cli/
│   ├── index.ts                   # CLI entry point
│   ├── commands/
│   │   ├── start.ts               # Start orchestrator
│   │   ├── stop.ts                # Stop orchestrator
│   │   ├── status.ts              # Show status
│   │   ├── workers.ts             # Manage workers
│   │   ├── skills.ts              # Manage skills
│   │   ├── context.ts             # Manage context
│   │   ├── sandbox.ts             # Sandbox operations
│   │   └── config.ts              # Configuration
│   ├── options.ts                 # CLI options
│   └── progress.ts                # Progress display
│
├── orchestrator/
│   ├── index.ts                   # Orchestrator exports
│   ├── ceo.ts                     # CEO agent implementation
│   ├── task-router.ts             # Task routing logic
│   ├── session-manager.ts         # Session lifecycle
│   ├── health-monitor.ts          # Health monitoring
│   ├── checkpoint.ts              # Checkpoint/resume
│   └── events.ts                  # Event system
│
├── workers/
│   ├── index.ts                   # Workers exports
│   ├── base-worker.ts             # Base worker class
│   ├── worker-manager.ts          # Worker lifecycle
│   ├── worker-comm.ts            # Inter-worker communication
│   ├── task-queue.ts              # Distributed task queue
│   │
│   ├── code-worker/               # Coding specialist
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── bash.ts
│   │   │   ├── file.ts
│   │   │   ├── git.ts
│   │   │   └── search.ts
│   │   └── skills.md
│   │
│   ├── research-worker/           # Research specialist
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── web-search.ts
│   │   │   ├── document.ts
│   │   │   └── analysis.ts
│   │   └── skills.md
│   │
│   ├── creative-worker/           # Creative specialist
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── generate.ts
│   │   │   ├── design.ts
│   │   │   └── content.ts
│   │   └── skills.md
│   │
│   ├── data-worker/               # Data specialist
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── database.ts
│   │   │   ├── analytics.ts
│   │   │   └── transform.ts
│   │   └── skills.md
│   │
│   ├── system-worker/             # System operations
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── process.ts
│   │   │   ├── monitoring.ts
│   │   │   └── config.ts
│   │   └── skills.md
│   │
│   └── kimi-worker/               # Kimi specialist
│       ├── index.ts
│       ├── tools/
│       │   ├── chinese.ts
│       │   ├── translation.ts
│       │   └── culture.ts
│       └── skills.md
│
├── context/
│   ├── index.ts                   # Context exports
│   ├── context-loader.ts           # Load .molt.md files
│   ├── context-parser.ts           # Parse context format
│   ├── context-merge.ts            # Merge context layers
│   ├── context-cache.ts            # Context caching
│   ├── providers/                 # Context providers
│   │   ├── file-provider.ts
│   │   ├── memory-provider.ts
│   │   ├── worker-provider.ts
│   │   └── model-provider.ts
│   └── types.ts                    # Context types
│
├── memory/
│   ├── index.ts                   # Memory exports
│   ├── memory-manager.ts          # Memory orchestration
│   ├── vector-store.ts             # Vector storage (sqlite-vec)
│   ├── embeddings.ts              # Embedding generation
│   ├── rag-engine.ts              # RAG implementation
│   ├── session-memory.ts           # Session-specific memory
│   ├── long-term-memory.ts         # Persistent memory
│   └── types.ts                    # Memory types
│
├── models/
│   ├── index.ts                   # Models exports
│   ├── model-router.ts             # Model selection router
│   ├── base-model.ts              # Base model interface
│   ├── provider-kimi.ts           # Kimi provider
│   ├── provider-anthropic.ts      # Anthropic provider
│   ├── provider-google.ts         # Google provider
│   ├── provider-minimax.ts        # MiniMax provider
│   ├── model-cache.ts             # Response caching
│   ├── cost-tracker.ts            # Cost tracking
│   └── types.ts                   # Model types
│
├── sandbox/
│   ├── index.ts                   # Sandbox exports
│   ├── sandbox-manager.ts         # Sandbox lifecycle
│   ├── v2-sandbox.ts              # V2 sandbox implementation
│   ├── experiment-runner.ts        # Experiment execution
│   ├── code-generator.ts          # Code generation
│   ├── memory-optimizer.ts        # Memory optimization
│   ├── evolution-controller.ts    # Evolution logic
│   ├── docker-runtime.ts          # Docker isolation
│   └── types.ts                   # Sandbox types
│
├── daemon/
│   ├── index.ts                   # Daemon exports
│   ├── daemon-manager.ts          # Daemon lifecycle
│   ├── backends/                  # Platform backends
│   │   ├── systemd.ts             # Linux systemd
│   │   ├── launchd.ts             # macOS launchd
│   │   ├── schtasks.ts            # Windows schtasks
│   │   └── pm2.ts                 # PM2 process manager
│   ├── health-check.ts            # Health checks
│   ├── restart-policy.ts           # Restart policies
│   └── types.ts                   # Daemon types
│
├── frontend/
│   ├── electron/                  # Electron main process
│   │   ├── index.ts
│   │   ├── main.ts
│   │   ├── ipc-handler.ts
│   │   ├── menu.ts
│   │   ├── window.ts
│   │   └── preload.ts
│   │
│   └── react/                     # React frontend
│       ├── index.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Dashboard.tsx
│       │   ├── WorkersPanel.tsx
│       │   ├── ContextPanel.tsx
│       │   ├── MemoryPanel.tsx
│       │   ├── SandboxPanel.tsx
│       │   └── Settings.tsx
│       ├── hooks/
│       ├── store/
│       ├── api/
│       └── styles/
│
├── shared/
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── async.ts
│   │   ├── errors.ts
│   │   └── validation.ts
│   ├── config/
│   │   ├── defaults.ts
│   │   └── validation.ts
│   ├── constants.ts
│   └── types.ts
│
└── types/
    ├── agent.ts
    ├── task.ts
    ├── session.ts
    ├── context.ts
    └── events.ts
```

### 2.3 Packages Directory Structure

```
packages/
├── core/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── orchestrator.ts
│   │   ├── worker.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── worker-base/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── BaseWorker.ts
│   │   ├── TaskHandler.ts
│   │   └── ToolRegistry.ts
│   └── tsconfig.json
│
├── model-kimi/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── KimiProvider.ts
│   │   ├── KimiConfig.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── model-anthropic/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── AnthropicProvider.ts
│   │   ├── OpusConfig.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── model-google/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── GoogleProvider.ts
│   │   ├── GeminiConfig.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── model-minimax/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── MiniMaxProvider.ts
│   │   ├── MiniMaxConfig.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── context-files/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── ContextFile.ts
│   │   ├── Parser.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── sandbox-v2/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── V2Sandbox.ts
│   │   ├── Experiment.ts
│   │   └── types.ts
│   └── tsconfig.json
│
├── frontend-electron/
│   ├── package.json
│   ├── src/
│   │   ├── main.ts
│   │   ├── preload.ts
│   │   └── assets/
│   └── tsconfig.json
│
├── frontend-react/
│   ├── package.json
│   ├── src/
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   └── components/
│   ├── public/
│   └── tsconfig.json
│
└── api-server/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── routes/
    │   │   ├── workers.ts
    │   │   ├── context.ts
    │   │   ├── memory.ts
    │   │   ├── sandbox.ts
    │   │   └── config.ts
    │   ├── middleware/
    │   └── types.ts
    └── tsconfig.json
```

### 2.4 Skills Directory Structure

```
skills/
├── coding/
│   ├── SKILL.md                   # Skill metadata and instructions
│   ├── bash.md                    # Bash scripting
│   ├── file-operations.md         # File operations
│   ├── git-workflows.md           # Git workflows
│   ├── code-review.md             # Code review
│   ├── testing.md                 # Testing strategies
│   └── debugging.md              # Debugging techniques
│
├── research/
│   ├── SKILL.md
│   ├── web-search.md              # Web search strategies
│   ├── document-analysis.md       # Document analysis
│   ├── source-evaluation.md       # Source evaluation
│   └── synthesis.md               # Information synthesis
│
├── creative/
│   ├── SKILL.md
│   ├── content-creation.md       # Content creation
│   ├── design-thinking.md         # Design thinking
│   ├── storytelling.md           # Storytelling
│   └── visualization.md          # Visualization
│
├── data/
│   ├── SKILL.md
│   ├── database.md                # Database operations
│   ├── analytics.md               # Analytics
│   ├── transformation.md         # Data transformation
│   └── visualization.md          # Data visualization
│
├── system/
│   ├── SKILL.md
│   ├── process-management.md     # Process management
│   ├── monitoring.md             # System monitoring
│   ├── security.md               # Security practices
│   └── optimization.md           # Optimization
│
└── kimi/
    ├── SKILL.md
    ├── chinese-language.md        # Chinese language
    ├── translation.md             # Translation
    ├── cultural-context.md        # Cultural context
    └── chinese-services.md       # Chinese services
```

## 3. Phase-by-Phase Implementation

### Phase 1: Core Orchestrator & Daemon (Weeks 1-2)

Phase 1 establishes the foundation of the MOLT-OS orchestrator with a focus on the CEO agent implementation and daemon operations. This phase creates the core infrastructure that all subsequent components depend upon.

**Objectives:**

The primary objective is to implement a robust CEO orchestrator capable of task decomposition, worker delegation, and health monitoring. The CEO agent must handle incoming tasks, analyze their requirements, select appropriate workers, and track task completion across the worker hierarchy.

**Deliverables:**

1. **CEO Orchestrator Implementation** - The CEO orchestrator serves as the central brain of the system. It receives high-level tasks from users or external systems, decomposes them into actionable subtasks, assigns subtasks to appropriate workers based on their capabilities, and monitors progress until completion. The CEO implements sophisticated task routing logic that considers worker load, task requirements, context availability, and model preferences.

```typescript
// src/orchestrator/ceo.ts
import { EventEmitter } from 'events';
import { TaskRouter } from './task-router';
import { SessionManager } from './session-manager';
import { HealthMonitor } from './health-monitor';
import { ContextManager } from '../context/context-manager';
import { MemoryManager } from '../memory/memory-manager';
import { CEOConfig, Task, TaskStatus, WorkerInfo } from '../types';

export class CEOOrchestrator extends EventEmitter {
  private taskRouter: TaskRouter;
  private sessionManager: SessionManager;
  private healthMonitor: HealthMonitor;
  private contextManager: ContextManager;
  private memoryManager: MemoryManager;
  private config: CEOConfig;
  private isRunning: boolean = false;

  constructor(config: CEOConfig) {
    super();
    this.config = config;
    this.taskRouter = new TaskRouter(config.router);
    this.sessionManager = new SessionManager(config.sessions);
    this.healthMonitor = new HealthMonitor(config.health);
    this.contextManager = new ContextManager(config.context);
    this.memoryManager = new MemoryManager(config.memory);
  }

  async start(): Promise<void> {
    await this.contextManager.initialize();
    await this.memoryManager.initialize();
    await this.sessionManager.initialize();
    await this.healthMonitor.start();
    
    this.isRunning = true;
    this.emit('started');
    
    this.processTaskQueue();
  }

  async submitTask(task: Task): Promise<string> {
    const sessionId = await this.sessionManager.createSession(task);
    const context = await this.contextManager.getContext(task.location);
    
    await this.memoryManager.storeTask(task, sessionId);
    
    const subtasks = await this.decomposeTask(task, context);
    for (const subtask of subtasks) {
      await this.taskRouter.enqueue(subtask);
    }
    
    return sessionId;
  }

  private async decomposeTask(task: Task, context: Context): Promise<Task[]> {
    // Task decomposition logic
    // Uses RAG to find similar tasks and their decompositions
    // Generates optimal subtask breakdown
    return [];
  }

  private async processTaskQueue(): Promise<void> {
    while (this.isRunning) {
      const task = await this.taskRouter.dequeue();
      if (task) {
        await this.executeTask(task);
      }
      await this.sleep(100);
    }
  }
}
```

2. **Daemon Management System** - The daemon system enables 24/7 operation across multiple platforms. It implements platform-specific backends for systemd (Linux), launchd (macOS), schtasks (Windows), and PM2 (cross-platform process management). The daemon handles automatic restarts, graceful shutdowns, log rotation, and health monitoring.

```typescript
// src/daemon/daemon-manager.ts
import { EventEmitter } from 'events';
import { SystemdBackend } from './backends/systemd';
import { LaunchdBackend } from './backends/launchd';
import { SchtasksBackend } from './backends/schtasks';
import { PM2Backend } from './backends/pm2';
import { DaemonConfig, DaemonBackend, Platform } from './types';

export class DaemonManager extends EventEmitter {
  private backend: DaemonBackend;
  private config: DaemonConfig;
  private platform: Platform;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.platform = this.detectPlatform();
    this.backend = this.createBackend();
  }

  private detectPlatform(): Platform {
    switch (process.platform) {
      case 'linux': return 'linux';
      case 'darwin': return 'macos';
      case 'win32': return 'windows';
      default: return 'linux';
    }
  }

  private createBackend(): DaemonBackend {
    switch (this.platform) {
      case 'linux': return new SystemdBackend(this.config);
      case 'macos': return new LaunchdBackend(this.config);
      case 'windows': return new SchtasksBackend(this.config);
      default: return new PM2Backend(this.config);
    }
  }

  async install(): Promise<void> {
    await this.backend.install();
    await this.backend.enable();
    this.emit('installed');
  }

  async uninstall(): Promise<void> {
    await this.backend.disable();
    await this.backend.uninstall();
    this.emit('uninstalled');
  }

  async start(): Promise<void> {
    await this.backend.start();
    this.emit('started');
  }

  async stop(): Promise<void> {
    await this.backend.stop();
    this.emit('stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
    this.emit('restarted');
  }

  async getStatus(): Promise<DaemonStatus> {
    return this.backend.getStatus();
  }

  async getLogs(options: LogOptions): Promise<string[]> {
    return this.backend.getLogs(options);
  }
}
```

3. **Session Management with Checkpoint/Resume** - Session management ensures that all task progress is preserved and can be resumed after interruptions. Sessions track task state, intermediate results, worker assignments, and context snapshots. The checkpoint system periodically saves session state to persistent storage, enabling recovery from failures.

```typescript
// src/orchestrator/session-manager.ts
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionState, Checkpoint, SessionConfig } from '../types';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private checkpointsDir: string;
  private config: SessionConfig;
  private checkpointInterval: NodeJS.Timeout | null = null;

  constructor(config: SessionConfig) {
    super();
    this.config = config;
    this.checkpointsDir = path.join(config.baseDir, 'checkpoints');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.checkpointsDir, { recursive: true });
    await this.loadPersistedSessions();
    
    this.checkpointInterval = setInterval(
      () => this.createAllCheckpoints(),
      this.config.checkpointInterval
    );
  }

  async createSession(task: Task): Promise<string> {
    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      task,
      status: 'pending',
      state: {
        currentStep: 0,
        subtasks: [],
        results: [],
        contextSnapshot: null,
        workerAssignments: {}
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      checkpointHistory: []
    };
    
    this.sessions.set(sessionId, session);
    await this.persistSession(session);
    
    return sessionId;
  }

  async createCheckpoint(sessionId: string): Promise<Checkpoint> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      sessionId,
      state: JSON.parse(JSON.stringify(session.state)),
      timestamp: new Date(),
      version: session.state.currentStep
    };
    
    session.checkpointHistory.push(checkpoint);
    await this.persistCheckpoint(checkpoint);
    await this.persistSession(session);
    
    this.emit('checkpoint', { sessionId, checkpoint });
    return checkpoint;
  }

  async resumeFromCheckpoint(sessionId: string, checkpointId?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    const checkpoint = checkpointId 
      ? session.checkpointHistory.find(c => c.id === checkpointId)
      : session.checkpointHistory[session.checkpointHistory.length - 1];
    
    if (!checkpoint) throw new Error('No checkpoint found');
    
    session.state = checkpoint.state;
    session.status = 'resumed';
    session.updatedAt = new Date();
    
    await this.persistSession(session);
    this.emit('resumed', { sessionId, checkpointId: checkpoint.id });
  }

  private async persistSession(session: Session): Promise<void> {
    const filePath = path.join(this.config.sessionsDir, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }
}
```

**Testing Strategy:**

Phase 1 requires comprehensive testing of the CEO orchestrator's task decomposition capabilities, daemon installation and management across platforms, and session checkpoint/resume functionality. Integration tests verify inter-component communication and error handling.

**Dependencies:** `@mariozechner/pi-agent-core`, `ws`, `chokidar`, `croner`, `proper-lockfile`

---

### Phase 2: Worker Agents System (Weeks 3-4)

Phase 2 implements the worker agent hierarchy that executes specialized tasks delegated by the CEO orchestrator. Workers are designed as isolated processes with their own context, memory, and tool access.

**Objectives:**

The worker system establishes a flexible architecture where specialized workers handle different task domains. Each worker runs as an independent process, communicates via message passing, and maintains its own context and memory. The base worker class provides common functionality while specialized workers extend it with domain-specific tools and behaviors.

**Deliverables:**

1. **Base Worker Class** - The base worker class defines the common interface and functionality for all workers. It handles task execution, tool registration, context management, and communication with the CEO orchestrator.

```typescript
// src/workers/base-worker.ts
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { 
  BaseWorkerConfig, 
  Task, 
  TaskResult, 
  Tool, 
  WorkerStatus,
  Context,
  Memory 
} from '../types';
import { ToolRegistry } from './tool-registry';
import { ContextProvider } from '../context/context-provider';
import { MemoryManager } from '../memory/memory-manager';

export abstract class BaseWorker extends EventEmitter {
  protected id: string;
  protected name: string;
  protected type: string;
  protected status: WorkerStatus = 'idle';
  protected currentTask: Task | null = null;
  protected toolRegistry: ToolRegistry;
  protected contextProvider: ContextProvider;
  protected memoryManager: MemoryManager;
  protected socket: WebSocket | null = null;
  protected config: BaseWorkerConfig;

  constructor(config: BaseWorkerConfig) {
    super();
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.type = config.type;
    this.config = config;
    this.toolRegistry = new ToolRegistry();
    this.contextProvider = new ContextProvider(config.context);
    this.memoryManager = new MemoryManager(config.memory);
  }

  abstract getSkills(): string[];
  abstract registerTools(): void;

  async initialize(): Promise<void> {
    await this.contextProvider.initialize();
    await this.memoryManager.initialize();
    this.registerTools();
    this.registerDefaultTools();
    
    this.status = 'ready';
    this.emit('ready');
  }

  protected registerDefaultTools(): void {
    this.toolRegistry.register('echo', {
      name: 'echo',
      description: 'Echo a message back',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to echo' }
        },
        required: ['message']
      },
      handler: async (args) => ({ message: args.message })
    });
  }

  async connect(orchestratorUrl: string): Promise<void> {
    this.socket = new WebSocket(orchestratorUrl);
    
    this.socket.on('open', () => {
      this.send({
        type: 'register',
        workerId: this.id,
        workerType: this.type,
        workerName: this.name,
        skills: this.getSkills()
      });
    });

    this.socket.on('message', async (data) => {
      await this.handleMessage(JSON.parse(data.toString()));
    });

    this.socket.on('close', () => {
      this.status = 'disconnected';
      this.emit('disconnected');
    });
  }

  protected async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'task':
        await this.executeTask(message.task);
        break;
      case 'cancel':
        await this.cancelTask(message.taskId);
        break;
      case 'ping':
        this.send({ type: 'pong', workerId: this.id });
        break;
    }
  }

  async executeTask(task: Task): Promise<void> {
    this.status = 'working';
    this.currentTask = task;
    this.emit('task-started', { taskId: task.id });
    
    try {
      const context = await this.contextProvider.getContext(task.location);
      const relevantMemory = await this.memoryManager.search(
        task.description,
        context
      );
      
      const result = await this.runTaskLoop(task, context, relevantMemory);
      
      this.send({
        type: 'task-result',
        taskId: task.id,
        result
      });
      
      this.status = 'ready';
      this.currentTask = null;
      this.emit('task-completed', { taskId: task.id, result });
      
    } catch (error) {
      this.status = 'error';
      this.currentTask = null;
      this.send({
        type: 'task-error',
        taskId: task.id,
        error: error.message
      });
      this.emit('task-error', { taskId: task.id, error });
    }
  }

  protected abstract runTaskLoop(
    task: Task,
    context: Context,
    memory: Memory[]
  ): Promise<TaskResult>;

  private send(message: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
```

2. **Specialized Worker Implementations** - Six specialized workers cover different task domains. Each worker registers domain-specific tools and skills while inheriting core functionality from the base class.

The **Code Worker** handles all coding-related tasks including file operations, bash commands, git workflows, code review, testing, and debugging. It integrates with MiniMax 2.1 for efficient code generation and analysis.

The **Research Worker** manages information gathering, web search, document analysis, source evaluation, and information synthesis. It uses Gemini 3.0 for fast iteration through large information spaces.

The **Creative Worker** focuses on content creation, design thinking, storytelling, and visualization. Opus 4.5 provides the creative reasoning capabilities needed for these tasks.

The **Data Worker** handles database operations, analytics, data transformation, and visualization. MiniMax 2.1 again proves efficient for data processing tasks.

The **System Worker** manages process operations, system monitoring, security practices, and performance optimization. Kimi k2.5 handles system tasks with Chinese language support for localized operations.

The **Kimi Worker** specializes in Chinese language tasks, translation, cultural context understanding, and Chinese service integrations.

3. **Inter-Worker Communication** - Workers communicate via WebSocket connections to the CEO orchestrator, sending task requests, receiving task assignments, and reporting results. A message passing system enables workers to request assistance from other workers when tasks require multiple domains of expertise.

```typescript
// src/workers/worker-comm.ts
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { 
  WorkerMessage, 
  WorkerMessageTypes,
  CrossWorkerRequest,
  CrossWorkerResponse 
} from '../types';

export class WorkerCommunication extends EventEmitter {
  private socket: WebSocket | null = null;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private messageHandlers: Map<string, (message: any) => void> = new Map();
  private workerId: string;

  constructor(workerId: string) {
    super();
    this.workerId = workerId;
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    this.messageHandlers['cross-worker-response'] = (message) => {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        if (message.success) {
          pending.resolve(message.response);
        } else {
          pending.reject(new Error(message.error));
        }
        this.pendingRequests.delete(message.requestId);
      }
    };
  }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);
      
      this.socket.on('open', () => resolve());
      this.socket.on('error', reject);
      
      this.socket.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });
    });
  }

  async requestAssistance(
    targetWorker: string,
    request: CrossWorkerRequest
  ): Promise<CrossWorkerResponse> {
    const requestId = uuidv4();
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      this.send({
        type: 'cross-worker-request',
        requestId,
        fromWorker: this.workerId,
        toWorker: targetWorker,
        request
      });
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  broadcast(message: Omit<WorkerMessage, 'fromWorker'>): void {
    this.send({
      ...message,
      fromWorker: this.workerId,
      type: 'broadcast'
    });
  }

  private handleMessage(message: WorkerMessage): void {
    const handler = this.messageHandlers[message.type];
    if (handler) {
      handler(message);
    }
    this.emit(message.type, message);
  }

  private send(message: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
```

**Testing Strategy:**

Phase 2 tests worker instantiation, task execution, tool registration, inter-worker communication, and error handling. Each specialized worker requires domain-specific tests verifying correct tool behavior and response generation.

---

### Phase 3: Context Layer (Weeks 5-6)

Phase 3 implements the file-system-based context system that makes MOLT-OS location-aware. Context files (`.molt.md`) in directories provide task-specific instructions, model preferences, and operational constraints.

**Objectives:**

The context system creates a declarative configuration format for defining agent behavior within specific directories or projects. Context files enable automatic adaptation to different working environments without requiring manual configuration for each task.

**Deliverables:**

1. **Context File Format Specification** - The `.molt.md` format defines how context is expressed. It supports multiple sections for different aspects of agent configuration.

```markdown
---
name: my-project
version: 1.0.0
type: project
---

# Project Context

## Description
This is a Python web application with a React frontend.

## Preferred Models
- coding: MiniMax 2.1
- creative: Opus 4.5
- research: Gemini 3.0

## Task Instructions
- Always use type hints in Python code
- Follow PEP 8 style guidelines
- Write tests for all new functions
- Use English for code comments

## Constraints
- Maximum 80 character line length
- No external API keys in code
- Use environment variables for secrets

## Worker Configuration
code-worker:
  tools:
    enabled: [bash, file, git, search]
    disabled: []
  timeout: 300

research-worker:
  tools:
    enabled: [web-search, document]
    disabled: [analysis]

## Skills
- python
- react
- postgresql
- docker

## Environment Variables
DATABASE_URL=postgresql://localhost:5432/myapp
REDIS_URL=redis://localhost:6379

## Context Providers
- memory: true
- skills: true
- workers: true
```

2. **Context Loader and Parser** - The context loader recursively searches directories for `.molt.md` files, loading and merging them to create a hierarchical context stack.

```typescript
// src/context/context-loader.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { ContextLayer, ContextFile, MergeStrategy } from './types';

export class ContextLoader {
  private contextCache: Map<string, ContextLayer> = new Map();
  private fileWatcher: FileWatcher | null = null;
  private mergeStrategy: MergeStrategy = 'deep';

  async loadContext(directory: string): Promise<ContextLayer> {
    const cacheKey = path.resolve(directory);
    
    if (this.contextCache.has(cacheKey)) {
      return this.contextCache.get(cacheKey)!;
    }

    const contextFiles = await this.findContextFiles(directory);
    const mergedContext = await this.mergeContextFiles(contextFiles);
    
    this.contextCache.set(cacheKey, mergedContext);
    return mergedContext;
  }

  private async findContextFiles(directory: string): Promise<ContextFile[]> {
    const files: ContextFile[] = [];
    const searchDir = path.resolve(directory);
    let currentDir = searchDir;

    while (currentDir !== path.parse(currentDir).root) {
      const contextPath = path.join(currentDir, '.molt.md');
      
      try {
        const content = await fs.readFile(contextPath, 'utf-8');
        const parsed = matter(content);
        
        files.push({
          path: contextPath,
          directory: currentDir,
          frontmatter: parsed.data,
          content: parsed.content,
          timestamp: (await fs.stat(contextPath)).mtime
        });
      } catch (error) {
        // .molt.md not found in this directory, continue searching
      }

      currentDir = path.dirname(currentDir);
    }

    return files.reverse(); // Root first, most specific last
  }

  private async mergeContextFiles(files: ContextFile[]): Promise<ContextLayer> {
    const merged: ContextLayer = {
      name: '',
      version: '',
      type: 'directory',
      description: '',
      models: {},
      instructions: [],
      constraints: [],
      workers: {},
      skills: [],
      envVars: {},
      providers: {},
      parent: null,
      files
    };

    for (const file of files) {
      this.mergeContext(merged, file);
    }

    return merged;
  }

  private mergeContext(target: ContextLayer, source: ContextFile): void {
    if (source.frontmatter.name) target.name = source.frontmatter.name;
    if (source.frontmatter.version) target.version = source.frontmatter.version;
    if (source.frontmatter.type) target.type = source.frontmatter.type;
    if (source.frontmatter.description) {
      target.description = source.frontmatter.description;
    }
    
    Object.assign(target.models, source.frontmatter.models || {});
    target.instructions.push(...(source.frontmatter.instructions || []));
    target.constraints.push(...(source.frontmatter.constraints || []));
    Object.assign(target.workers, source.frontmatter.workers || {});
    target.skills.push(...(source.frontmatter.skills || []));
    Object.assign(target.envVars, source.frontmatter.envVars || {});
    Object.assign(target.providers, source.frontmatter.providers || {});
  }

  async watchContext(directory: string, callback: (layer: ContextLayer) => void): Promise<void> {
    this.fileWatcher = new FileWatcher(directory, '.molt.md');
    
    this.fileWatcher.on('change', async (filePath) => {
      this.contextCache.clear();
      const context = await this.loadContext(directory);
      callback(context);
    });
  }

  invalidateCache(directory: string): void {
    const cacheKey = path.resolve(directory);
    this.contextCache.delete(cacheKey);
  }
}
```

3. **Context Manager Integration** - The context manager integrates with the CEO orchestrator and workers to provide context-aware behavior throughout the system.

```typescript
// src/context/context-manager.ts
import { EventEmitter } from 'events';
import { ContextLoader } from './context-loader';
import { ContextLayer, ContextProvider, ContextConfig } from './types';

export class ContextManager extends EventEmitter {
  private loader: ContextLoader;
  private providers: Map<string, ContextProvider> = new Map();
  private config: ContextConfig;

  constructor(config: ContextConfig) {
    super();
    this.config = config;
    this.loader = new ContextLoader();
    this.registerProviders();
  }

  private registerProviders(): void {
    this.providers.set('memory', new MemoryContextProvider());
    this.providers.set('skills', new SkillsContextProvider());
    this.providers.set('workers', new WorkersContextProvider());
    this.providers.set('models', new ModelsContextProvider());
  }

  async initialize(): Promise<void> {
    await this.loader.loadContext(this.config.baseDir);
  }

  async getContext(location: string): Promise<Context> {
    const layer = await this.loader.loadContext(location);
    const providerContexts = await this.getProviderContexts(layer);
    
    return {
      layer,
      providers: providerContexts,
      location,
      timestamp: new Date()
    };
  }

  private async getProviderContexts(layer: ContextLayer): Promise<Map<string, any>> {
    const contexts = new Map();
    
    for (const [name, enabled] of Object.entries(layer.providers)) {
      if (enabled && this.providers.has(name)) {
        const provider = this.providers.get(name)!;
        contexts.set(name, await provider.provide(layer));
      }
    }
    
    return contexts;
  }

  updateContext(location: string, updates: Partial<ContextLayer>): Promise<void> {
    // Write updates to .molt.md file
    // Invalidate cache
    // Notify workers of context change
    return Promise.resolve();
  }
}
```

**Testing Strategy:**

Phase 3 tests context file parsing, hierarchical merging, caching behavior, and hot-reloading when context files change. Tests verify correct behavior across different directory structures and merge scenarios.

---

### Phase 4: Memory System (Weeks 7-8)

Phase 4 implements the RAG-based memory system using sqlite-vec for vector storage. The memory system provides long-term memory, session memory, and semantic search capabilities.

**Objectives:**

The memory system enables agents to learn from past experiences, retrieve relevant information based on semantic similarity, and maintain context across sessions. The system uses vector embeddings for semantic search and structured storage for metadata.

**Deliverables:**

1. **Vector Store with sqlite-vec** - The vector store provides efficient storage and retrieval of embeddings using sqlite-vec.

```typescript
// src/memory/vector-store.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { 
  VectorStore, 
  Embedding, 
  VectorQuery, 
  VectorResult,
  StorageConfig 
} from './types';

export class VectorStoreImpl implements VectorStore {
  private db: Database.Database;
  private embeddingDimension: number;

  constructor(config: StorageConfig) {
    this.db = new Database(config.path);
    this.embeddingDimension = config.dimension || 1536;
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        embedding BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        workspace_id TEXT
      );
      
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
      ON embeddings(workspace_id);
    `);
  }

  async addEmbedding(
    content: string,
    embedding: number[],
    metadata?: Record<string, any>
  ): Promise<string> {
    const id = uuidv4();
    const embeddingBlob = this.embeddingToBlob(embedding);
    
    const stmt = this.db.prepare(`
      INSERT INTO embeddings (id, content, metadata, embedding, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id, 
      content, 
      JSON.stringify(metadata || {}), 
      embeddingBlob, 
      Date.now()
    );
    
    return id;
  }

  async search(
    queryEmbedding: number[],
    options: VectorQuery
  ): Promise<VectorResult[]> {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.7;
    const workspaceId = options.workspaceId;

    let query = `
      SELECT 
        id, content, metadata,
        cosine_distance(embedding, ?) as distance
      FROM embeddings
    `;

    const params: any[] [this.embeddingToBlob(queryEmbedding)];

    if (workspaceId) {
      query += ' WHERE workspace_id = ?';
      params.push(workspaceId);
    }

    query += ` ORDER BY distance ASC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);

    return results
      .filter(r => 1 - r.distance >= threshold)
      .map(r => ({
        id: r.id,
        content: r.content,
        metadata: JSON.parse(r.metadata || '{}'),
        score: 1 - r.distance
      }));
  }

  async deleteEmbedding(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM embeddings WHERE id = ?');
    stmt.run(id);
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM embeddings WHERE workspace_id = ?');
    stmt.run(workspaceId);
  }

  private embeddingToBlob(embedding: number[]): Buffer {
    return Buffer.from(new Float32Array(embedding).buffer);
  }
}
```

2. **RAG Engine** - The RAG engine combines vector search with language model generation to provide context-aware responses.

```typescript
// src/memory/rag-engine.ts
import { EmbeddingGenerator } from './embeddings';
import { VectorStore } from './vector-store';
import { MemoryConfig, RAGContext, RAGQuery, RAGResponse } from './types';

export class RAGEngine {
  private vectorStore: VectorStore;
  private embeddingGenerator: EmbeddingGenerator;
  private config: MemoryConfig;

  constructor(
    vectorStore: VectorStore,
    embeddingGenerator: EmbeddingGenerator,
    config: MemoryConfig
  ) {
    this.vectorStore = vectorStore;
    this.embeddingGenerator = embeddingGenerator;
    this.config = config;
  }

  async query(query: RAGQuery): Promise<RAGResponse> {
    const queryEmbedding = await this.embeddingGenerator.generate(
      query.text
    );

    const searchResults = await this.vectorStore.search(queryEmbedding, {
      limit: this.config.maxResults,
      threshold: this.config.similarityThreshold,
      workspaceId: query.workspaceId
    });

    const context = this.buildContext(query, searchResults);

    return {
      context,
      sources: searchResults.map(r => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata
      })),
      metadata: {
        queryLength: query.text.length,
        resultCount: searchResults.length,
        timestamp: new Date()
      }
    };
  }

  private buildContext(query: RAGQuery, results: any[]): string {
    const contextParts = [
      `Query: ${query.text}\n`,
      `Relevant Information:\n`
    ];

    for (let i = 0; i < results.length; i++) {
      contextParts.push(`[${i + 1}] ${results[i].content}\n`);
    }

    if (query.systemPrompt) {
      contextParts.push(`\nSystem Instructions: ${query.systemPrompt}`);
    }

    return contextParts.join('\n');
  }

  async storeMemory(
    content: string,
    type: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const embedding = await this.embeddingGenerator.generate(content);
    
    return this.vectorStore.addEmbedding(content, embedding, {
      type,
      ...metadata,
      storedAt: new Date().toISOString()
    });
  }
}
```

3. **Memory Manager** - The memory manager orchestrates different memory types and provides the main interface for memory operations.

```typescript
// src/memory/memory-manager.ts
import { EventEmitter } from 'events';
import { VectorStoreImpl } from './vector-store';
import { RAGEngine } from './rag-engine';
import { EmbeddingGenerator } from './embeddings';
import { MemoryConfig, MemoryType, MemoryQuery, MemoryResult } from './types';

export class MemoryManager extends EventEmitter {
  private vectorStore: VectorStoreImpl;
  private ragEngine: RAGEngine;
  private embeddingGenerator: EmbeddingGenerator;
  private config: MemoryConfig;
  private sessionMemory: Map<string, MemoryResult[]> = new Map();

  constructor(config: MemoryConfig) {
    super();
    this.config = config;
    this.embeddingGenerator = new EmbeddingGenerator(config.embedding);
    this.vectorStore = new VectorStoreImpl(config.vector);
    this.ragEngine = new RAGEngine(
      this.vectorStore,
      this.embeddingGenerator,
      config.rag
    );
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  async store(
    content: string,
    type: MemoryType,
    metadata?: Record<string, any>
  ): Promise<string> {
    const id = await this.memoryStore.storeMemory(content, type, metadata);
    this.emit('stored', { id, type });
    return id;
  }

  async search(query: MemoryQuery): Promise<MemoryResult[]> {
    const results = await this.ragEngine.query({
      text: query.text,
      workspaceId: query.workspaceId,
      systemPrompt: query.systemPrompt
    });

    return results.sources.map(s => ({
      id: s.id,
      content: s.content,
      type: s.metadata.type,
      score: s.score,
      metadata: s.metadata,
      timestamp: new Date(s.metadata.storedAt)
    }));
  }

  async storeSessionMemory(
    sessionId: string,
    task: string,
    result: any
  ): Promise<void> {
    const content = `Task: ${task}\nResult: ${JSON.stringify(result)}`;
    
    await this.store(content, 'session', { sessionId, task });
    
    const sessionResults = this.sessionMemory.get(sessionId) || [];
    sessionResults.push({
      id: sessionId,
      content,
      type: 'session',
      score: 1.0,
      metadata: { sessionId, task },
      timestamp: new Date()
    });
    
    this.sessionMemory.set(sessionId, sessionResults);
  }

  async getSessionMemory(sessionId: string): Promise<MemoryResult[]> {
    return this.sessionMemory.get(sessionId) || [];
  }

  async clearSessionMemory(sessionId: string): Promise<void> {
    this.sessionMemory.delete(sessionId);
  }

  async getStats(): Promise<MemoryStats> {
    return {
      totalMemories: await this.vectorStore.getCount(),
      sessionCount: this.sessionMemory.size,
      lastUpdated: new Date()
    };
  }
}
```

**Testing Strategy:**

Phase 4 tests vector storage, embedding generation, semantic search accuracy, RAG context construction, and memory retrieval performance. Tests verify correct behavior with various query types and memory configurations.

---

### Phase 5: Model Router (Weeks 9-10)

Phase 5 implements the model router that selects the optimal AI model for each task based on task requirements, model capabilities, cost considerations, and context preferences.

**Objectives:**

The model router enables intelligent routing of tasks to the most appropriate AI model. It considers task type, complexity, required capabilities, cost constraints, and user preferences to select between Kimi k2.5, Opus 4.5, Gemini 3.0, and MiniMax 2.1.

**Deliverables:**

1. **Model Router Implementation** - The router analyzes task requirements and selects the optimal model.

```typescript
// src/models/model-router.ts
import { EventEmitter } from 'events';
import { 
  ModelRouterConfig, 
  TaskRequirements, 
  ModelSelection,
  ModelCapabilities,
  CostConstraints 
} from './types';
import { KimiProvider } from './provider-kimi';
import { AnthropicProvider } from './provider-anthropic';
import { GoogleProvider } from './provider-google';
import { MiniMaxProvider } from './provider-minimax';

export class ModelRouter extends EventEmitter {
  private providers: Map<string, any> = new Map();
  private config: ModelRouterConfig;
  private capabilityMatrix: Map<string, ModelCapabilities> = new Map();

  constructor(config: ModelRouterConfig) {
    super();
    this.config = config;
    this.initializeCapabilityMatrix();
  }

  private initializeCapabilityMatrix(): void {
    this.capabilityMatrix.set('kimi-k2.5', {
      name: 'Kimi k2.5',
      strengths: ['chinese', 'translation', 'cultural', 'reasoning'],
      weaknesses: ['english-creative'],
      maxContext: 200000,
      maxOutput: 8192,
      costPer1kTokens: 0.002,
      speed: 'medium',
      supportedLanguages: ['zh', 'en', 'ja', 'ko']
    });

    this.capabilityMatrix.set('opus-4.5', {
      name: 'Opus 4.5',
      strengths: ['creative', 'reasoning', 'writing', 'analysis'],
      weaknesses: ['fast-throughput'],
      maxContext: 200000,
      maxOutput: 4096,
      costPer1kTokens: 0.015,
      speed: 'slow',
      supportedLanguages: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es']
    });

    this.capabilityMatrix.set('gemini-3.0', {
      name: 'Gemini 3.0',
      strengths: ['speed', 'large-context', 'multimodal', 'coding'],
      weaknesses: ['creative-writing'],
      maxContext: 1000000,
      maxOutput: 8192,
      costPer1kTokens: 0.0005,
      costPer1kImages: 0.0025,
      speed: 'fast',
      supportedLanguages: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'hi']
    });

    this.capabilityMatrix.set('minimax-2.1', {
      name: 'MiniMax 2.1',
      strengths: ['coding', 'efficiency', 'data-processing', 'structured'],
      weaknesses: ['creative-writing', 'long-context'],
      maxContext: 128000,
      maxOutput: 8192,
      costPer1kTokens: 0.001,
      speed: 'fast',
      supportedLanguages: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es']
    });
  }

  registerProvider(name: string, provider: any): void {
    this.providers.set(name, provider);
  }

  async selectModel(
    requirements: TaskRequirements,
    costConstraints?: CostConstraints
  ): Promise<ModelSelection> {
    const candidates = this.getCandidateModels(requirements);
    const ranked = await this.rankCandidates(candidates, requirements, costConstraints);
    const selected = ranked[0];

    return {
      model: selected.name,
      provider: selected.providerName,
      confidence: selected.score,
      reasoning: selected.reasoning
    };
  }

  private getCandidateModels(requirements: TaskRequirements): any[] {
    const candidates = [];

    for (const [modelName, capabilities] of this.capabilityMatrix) {
      if (!this.providers.has(modelName)) continue;

      let score = 0;

      for (const requiredCapability of requirements.requiredCapabilities) {
        if (capabilities.strengths.includes(requiredCapability)) {
          score += 10;
        } else if (capabilities.weaknesses.includes(requiredCapability)) {
          score -= 10;
        }
      }

      if (requirements.language) {
        if (capabilities.supportedLanguages.includes(requirements.language)) {
          score += 5;
        } else {
          score -= 20;
        }
      }

      if (requirements.contextLength <= capabilities.maxContext) {
        score += 3;
      }

      if (requirements.estimatedOutput <= capabilities.maxOutput) {
        score += 2;
      }

      if (score > 0) {
        candidates.push({
          name: modelName,
          providerName: modelName,
          capabilities,
          baseScore: score
        });
      }
    }

    return candidates.sort((a, b) => b.baseScore - a.baseScore);
  }

  private async rankCandidates(
    candidates: any[],
    requirements: TaskRequirements,
    costConstraints?: CostConstraints
  ): Promise<any[]> {
    for (const candidate of candidates) {
      let score = candidate.baseScore;

      if (costConstraints) {
        const estimatedCost = this.estimateCost(candidate, requirements);
        
        if (costConstraints.maxCost && estimatedCost > costConstraints.maxCost) {
          score = -Infinity;
        } else {
          score += (costConstraints.maxCost - estimatedCost) * 0.1;
        }
      }

      if (requirements.speed === 'fast' && candidate.capabilities.speed === 'fast') {
        score += 10;
      }

      if (requirements.speed === 'slow' && candidate.capabilities.speed === 'slow') {
        score += 5;
      }

      candidate.score = score;
      candidate.reasoning = this.generateReasoning(candidate, requirements);
    }

    return candidates
      .filter(c => c.score > -Infinity)
      .sort((a, b) => b.score - a.score);
  }

  private estimateCost(candidate: any, requirements: TaskRequirements): number {
    const capabilities = candidate.capabilities;
    const inputTokens = requirements.estimatedInput || 1000;
    const outputTokens = requirements.estimatedOutput || 1000;
    
    const inputCost = inputTokens / 1000 * capabilities.costPer1kTokens;
    const outputCost = outputTokens / 1000 * capabilities.costPer1kTokens;
    
    return inputCost + outputCost;
  }

  private generateReasoning(candidate: any, requirements: TaskRequirements): string {
    const parts = [
      `${candidate.capabilities.name} selected`,
      `because it supports ${requirements.requiredCapabilities.join(', ')}`,
    ];

    if (candidate.capabilities.speed !== 'medium') {
      parts.push(`with ${candidate.capabilities.speed} processing`);
    }

    return parts.join(' ');
  }
}
```

2. **Model Provider Implementations** - Each model provider implements a common interface for interacting with different AI models.

```typescript
// src/models/provider-kimi.ts
import { BaseModelProvider, ModelConfig, ChatMessage, ChatResponse } from './types';

export class KimiProvider implements BaseModelProvider {
  private apiKey: string;
  private baseUrl: string;
  private config: ModelConfig;

  constructor(config: KimiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.moonshot.cn/v1';
    this.config = config;
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.modelId || 'kimi-k2.5',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        max_tokens: this.config.maxTokens || 8192,
        temperature: this.config.temperature || 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Kimi API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens
      },
      model: data.model,
      finishReason: data.choices[0].finish_reason
    };
  }

  async streamChat(messages: ChatMessage[]): AsyncIterator<ChatResponse> {
    // Streaming implementation
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'embedding-v1',
        input: text
      })
    });

    const data = await response.json();
    return data.data[0].embedding;
  }
}
```

3. **Cost Tracker** - The cost tracker monitors API usage and costs across all models.

```typescript
// src/models/cost-tracker.ts
import { EventEmitter } from 'events';
import { CostEntry, CostSummary, CostConfig } from './types';

export class CostTracker extends EventEmitter {
  private entries: CostEntry[] = [];
  private config: CostConfig;

  constructor(config: CostConfig) {
    super();
    this.config = config;
  }

  async recordUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cost: number
  ): Promise<void> {
    const entry: CostEntry = {
      id: crypto.randomUUID(),
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost,
      timestamp: new Date()
    };

    this.entries.push(entry);
    
    this.emit('usage-recorded', entry);
    
    if (this.config.dailyBudget && this.getDailyCost() > this.config.dailyBudget) {
      this.emit('budget-exceeded', { dailyCost: this.getDailyCost() });
    }
  }

  getDailyCost(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.entries
      .filter(e => e.timestamp >= today)
      .reduce((sum, e) => sum + e.cost, 0);
  }

  getModelCosts(): Map<string, number> {
    const costs = new Map<string, number>();
    
    for (const entry of this.entries) {
      const current = costs.get(entry.model) || 0;
      costs.set(entry.model, current + entry.cost);
    }
    
    return costs;
  }

  getSummary(): CostSummary {
    const modelCosts = this.getModelCosts();
    const totalCost = Array.from(modelCosts.values()).reduce((a, b) => a + b, 0);
    const totalTokens = this.entries.reduce((sum, e) => sum + e.totalTokens, 0);
    
    return {
      totalCost,
      totalTokens,
      dailyCost: this.getDailyCost(),
      modelCosts: Object.fromEntries(modelCosts),
      entryCount: this.entries.length,
      period: {
        start: this.entries[0]?.timestamp,
        end: this.entries[this.entries.length - 1]?.timestamp
      }
    };
  }
}
```

**Testing Strategy:**

Phase 5 tests model selection accuracy, cost tracking, provider integration, and fallback behavior when models are unavailable. Tests verify correct routing decisions for various task types.

---

### Phase 6: Frontend (Electron + MERN) (Weeks 11-13)

Phase 6 implements the frontend using Electron for desktop deployment and React with MERN stack for the web interface.

**Objectives:**

The frontend provides a real-time dashboard for monitoring and controlling the orchestrator, workers, context, memory, and sandbox. It includes both an Electron desktop application and a React web interface sharing common components.

**Deliverables:**

1. **Electron Main Process** - The Electron main process handles app lifecycle, IPC communication, and system integration.

```typescript
// src/frontend/electron/main.ts
import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron';
import * as path from 'path';
import { WebSocket } from 'ws';
import { OrchestratorClient } from '../shared/orchestrator-client';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let orchestratorClient: OrchestratorClient | null = null;

app.whenReady().then(async () => {
  createMainWindow();
  createTray();
  await connectToOrchestrator();
  setupIPC();
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { label: 'Hide', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Status', enabled: false },
    { label: 'Workers: Running', enabled: false },
    { type: 'separator' },
    { label: 'Restart Orchestrator', click: () => restartOrchestrator() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setToolTip('MOLT-OS Orchestrator');
  tray.setContextMenu(contextMenu);
}

async function connectToOrchestrator(): Promise<void> {
  orchestratorClient = new OrchestratorClient('ws://localhost:3000');
  
  orchestratorClient.on('status', (status) => {
    mainWindow?.webContents.send('orchestrator-status', status);
  });
  
  orchestratorClient.on('worker-update', (update) => {
    mainWindow?.webContents.send('worker-update', update);
  });
  
  orchestratorClient.on('task-complete', (result) => {
    mainWindow?.webContents.send('task-complete', result);
  });
  
  await orchestratorClient.connect();
}

function setupIPC(): void {
  ipcMain.handle('get-status', async () => {
    return orchestratorClient?.getStatus();
  });
  
  ipcMain.handle('start-worker', async (event, workerType: string) => {
    return orchestratorClient?.startWorker(workerType);
  });
  
  ipcMain.handle('stop-worker', async (event, workerId: string) => {
    return orchestratorClient?.stopWorker(workerId);
  });
  
  ipcMain.handle('submit-task', async (event, task: any) => {
    return orchestratorClient?.submitTask(task);
  });
  
  ipcMain.handle('get-context', async (event, location: string) => {
    return orchestratorClient?.getContext(location);
  });
  
  ipcMain.handle('search-memory', async (event, query: string) => {
    return orchestratorClient?.searchMemory(query);
  });
}
```

2. **React Dashboard Components** - The React frontend provides a comprehensive dashboard.

```typescript
// src/frontend/react/src/components/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { WorkersPanel } from './WorkersPanel';
import { ContextPanel } from './ContextPanel';
import { MemoryPanel } from './MemoryPanel';
import { SandboxPanel } from './SandboxPanel';
import { useOrchestratorAPI } from '../hooks/useOrchestratorAPI';
import './Dashboard.css';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'workers' | 'context' | 'memory' | 'sandbox'>('workers');
  const { status, workers, loading } = useOrchestratorAPI();

  if (loading) {
    return <div className="loading">Loading orchestrator status...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>MOLT-OS Orchestrator</h1>
        <div className="status-indicator">
          <span className={`status-dot ${status?.running ? 'running' : 'stopped'}`} />
          {status?.running ? 'Running' : 'Stopped'}
        </div>
      </header>
      
      <nav className="dashboard-nav">
        <button 
          className={activeTab === 'workers' ? 'active' : ''}
          onClick={() => setActiveTab('workers')}
        >
          Workers
        </button>
        <button 
          className={activeTab === 'context' ? 'active' : ''}
          onClick={() => setActiveTab('context')}
        >
          Context
        </button>
        <button 
          className={activeTab === 'memory' ? 'active' : ''}
          onClick={() => setActiveTab('memory')}
        >
          Memory
        </button>
        <button 
          className={activeTab === 'sandbox' ? 'active' : ''}
          onClick={() => setActiveTab('sandbox')}
        >
          Sandbox
        </button>
      </nav>
      
      <main className="dashboard-content">
        {activeTab === 'workers' && <WorkersPanel workers={workers} />}
        {activeTab === 'context' && <ContextPanel />}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'sandbox' && <SandboxPanel />}
      </main>
      
      <footer className="dashboard-footer">
        <div className="stats">
          <span>Active Workers: {workers?.filter(w => w.status === 'running').length || 0}</span>
          <span>Pending Tasks: {status?.pendingTasks || 0}</span>
          <span>Memory Items: {status?.memoryItems || 0}</span>
        </div>
      </footer>
    </div>
  );
};
```

3. **Express API Server** - The API server provides REST endpoints for the frontend.

```typescript
// src/frontend/api-server/src/index.ts
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { workersRouter } from './routes/workers';
import { contextRouter } from './routes/context';
import { memoryRouter } from './routes/memory';
import { sandboxRouter } from './routes/sandbox';
import { OrchestratorService } from './services/orchestrator';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const orchestratorService = new OrchestratorService();

app.use(express.json());

app.use('/api/workers', workersRouter(orchestratorService));
app.use('/api/context', contextRouter(orchestratorService));
app.use('/api/memory', memoryRouter(orchestratorService));
app.use('/api/sandbox', sandboxRouter(orchestratorService));

wss.on('connection', (ws) => {
  orchestratorService.subscribe(ws);
});

server.listen(3000, () => {
  console.log('API server running on http://localhost:3000');
});
```

**Testing Strategy:**

Phase 6 tests the complete frontend stack including Electron IPC, React component rendering, API endpoints, and WebSocket communication. E2E tests verify complete user workflows.

---

### Phase 7: Integration & Testing (Weeks 14-15)

Phase 7 focuses on integrating all components, comprehensive testing, and preparing for initial deployment.

**Objectives:**

This phase ensures all components work together correctly, implements comprehensive testing coverage, and prepares the system for production deployment.

**Deliverables:**

1. **Integration Testing Suite** - Tests verify end-to-end workflows across all components.

2. **Performance Testing** - Tests measure system performance under load.

3. **Security Audit** - Reviews ensure secure operation.

4. **Documentation** - Complete user and developer documentation.

## 4. Key Files to Create

### 4.1 Configuration Files

**package.json** - Root package configuration with workspace setup.

**tsconfig.json** - TypeScript configuration with strict mode and ESM support.

**pnpm-workspace.yaml** - PNPM workspace configuration for monorepo.

**.env.example** - Environment variable template.

### 4.2 Core Source Files

**src/index.ts** - Main entry point that initializes the orchestrator.

**src/cli/index.ts** - CLI interface with all commands.

**src/orchestrator/ceo.ts** - CEO orchestrator implementation.

**src/orchestrator/task-router.ts** - Task routing logic.

**src/orchestrator/session-manager.ts** - Session management with checkpoint/resume.

**src/workers/base-worker.ts** - Base worker class.

**src/workers/worker-manager.ts** - Worker lifecycle management.

**src/context/context-loader.ts** - Context file loading and parsing.

**src/memory/memory-manager.ts** - Memory orchestration.

**src/models/model-router.ts** - Model selection router.

**src/sandbox/sandbox-manager.ts** - Sandbox lifecycle management.

**src/daemon/daemon-manager.ts** - Cross-platform daemon management.

**src/frontend/electron/main.ts** - Electron main process.

### 4.3 Package Files

**packages/core/package.json** - Core package configuration.

**packages/core/src/index.ts** - Core exports.

**packages/worker-base/package.json** - Worker base package.

**packages/model-*/package.json** - Model provider packages.

### 4.4 Configuration Files

**src/config/schema.ts** - Zod schema for configuration validation.

**src/config/defaults.ts** - Default configuration values.

**src/config/types.ts** - Configuration type definitions.

### 4.5 Skill Files

**skills/coding/SKILL.md** - Coding skills definition.

**skills/research/SKILL.md** - Research skills definition.

**skills/*/SKILL.md** - Other skill definitions.

## 5. Dependencies Reference

### 5.1 Core Dependencies (from OpenClaw)

```json
{
  "@mariozechner/pi-agent-core": "0.51.1",
  "@mariozechner/pi-ai": "0.51.1",
  "@mariozechner/pi-coding-agent": "0.51.1",
  "@mariozechner/pi-tui": "0.51.1",
  "sqlite-vec": "0.1.7-alpha.2",
  "zod": "^4.3.6",
  "ws": "^8.19.0",
  "chokidar": "^5.0.0",
  "croner": "^10.0.1",
  "proper-lockfile": "^4.1.2",
  "tslog": "^4.10.2",
  "undici": "^7.20.0",
  "yaml": "^2.8.2",
  "chalk": "^5.6.2",
  "jiti": "^2.6.1",
  "dotenv": "^17.2.3",
  "express": "^5.2.1",
  "hono": "4.11.7"
}
```

### 5.2 Frontend Dependencies

```json
{
  "electron": "^28.0.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.20.0",
  "@tanstack/react-query": "^5.0.0",
  "zustand": "^4.4.0",
  "tailwindcss": "^3.3.0"
}
```

### 5.3 Development Dependencies

```json
{
  "typescript": "^5.9.3",
  "vitest": "^4.0.18",
  "tsx": "^4.21.0",
  "tsdown": "^0.20.1",
  "oxfmt": "0.28.0",
  "oxlint": "^1.43.0",
  "@types/node": "^25.2.0"
}
```

### 5.4 Database Dependencies

```json
{
  "better-sqlite3": "^9.2.2",
  "mongoose": "^8.0.0"
}
```

## 6. Configuration Schema

### 6.1 Root Configuration Schema

```typescript
import { z } from 'zod';

const WorkerConfigSchema = z.object({
  type: z.enum(['code', 'research', 'creative', 'data', 'system', 'kimi']),
  name: z.string(),
  enabled: z.boolean().default(true),
  model: z.string().default('minimax-2.1'),
  maxConcurrentTasks: z.number().default(3),
  timeout: z.number().default(300),
  tools: z.array(z.string()).default([]),
  memoryLimit: z.string().default('512MB'),
  environment: z.record(z.string()).default({})
});

const ModelConfigSchema = z.object({
  'kimi-k2.5': z.object({
    enabled: z.boolean().default(true),
    apiKey: z.string(),
    baseUrl: z.string().default('https://api.moonshot.cn/v1'),
    modelId: z.string().default('kimi-k2.5'),
    maxTokens: z.number().default(8192),
    temperature: z.number().default(0.7)
  }),
  'opus-4.5': z.object({
    enabled: z.boolean().default(true),
    apiKey: z.string(),
    baseUrl: z.string().default('https://api.anthropic.com'),
    modelId: z.string().default('opus-4.5-2025'),
    maxTokens: z.number().default(4096),
    temperature: z.number().default(0.7)
  }),
  'gemini-3.0': z.object({
    enabled: z.boolean().default(true),
    apiKey: z.string(),
    baseUrl: z.string().default('https://generativelanguage.googleapis.com/v1'),
    modelId: z.string().default('gemini-3.0-pro'),
    maxTokens: z.number().default(8192),
    temperature: z.number().default(0.7)
  }),
  'minimax-2.1': z.object({
    enabled: z.boolean().default(true),
    apiKey: z.string(),
    baseUrl: z.string().default('https://api.minimax.chat/v1'),
    modelId: z.string().default('minimax-2.1'),
    maxTokens: z.number().default(8192),
    temperature: z.number().default(0.7)
  })
});

const ContextConfigSchema = z.object({
  baseDir: z.string().default('./context'),
  autoReload: z.boolean().default(true),
  maxDepth: z.number().default(10),
  excludedPatterns: z.array(z.string()).default(['node_modules', '.git'])
});

const MemoryConfigSchema = z.object({
  vectorDbPath: z.string().default('./data/memory/vectors.db'),
  embeddingDimension: z.number().default(1536),
  maxResults: z.number().default(10),
  similarityThreshold: z.number().default(0.7),
  sessionMemoryLimit: z.number().default(1000)
});

const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dockerEnabled: z.boolean().default(true),
  experimentTimeout: z.number().default(600),
  maxExperiments: z.number().default(10),
  autoEvolve: z.boolean().default(false)
});

const DaemonConfigSchema = z.object({
  platform: z.enum(['auto', 'linux', 'macos', 'windows']).default('auto'),
  autoRestart: z.boolean().default(true),
  healthCheckInterval: z.number().default(30),
  restartPolicy: z.enum(['always', 'on-failure', 'never']).default('on-failure'),
  maxRestarts: z.number().default(5)
});

const CostConfigSchema = z.object({
  dailyBudget: z.number().optional(),
  monthlyBudget: z.number().optional(),
  alertThresholds: z.array(z.number()).default([50, 80, 100])
});

export const MOLTConfigSchema = z.object({
  name: z.string().default('molt-orchestrator'),
  version: z.string().default('1.0.0'),
  mode: z.enum(['development', 'production', 'sandbox']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  workers: z.array(WorkerConfigSchema).default([]),
  models: ModelConfigSchema,
  context: ContextConfigSchema,
  memory: MemoryConfigSchema,
  sandbox: SandboxConfigSchema,
  daemon: DaemonConfigSchema,
  cost: CostConfigSchema,
  api: z.object({
    port: z.number().default(3000),
    cors: z.array(z.string()).default(['http://localhost:5173']),
    auth: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional()
    }).default({})
  }).default({}),
  frontend: z.object({
    devMode: z.boolean().default(true),
    port: z.number().default(5173)
  }).default({})
});

export type MOLTConfig = z.infer<typeof MOLTConfigSchema>;
```

### 6.2 Worker Configuration Schema

```typescript
export interface WorkerConfig {
  id: string;
  type: WorkerType;
  name: string;
  model: ModelType;
  enabled: boolean;
  maxConcurrentTasks: number;
  timeout: number;
  tools: string[];
  environment: Record<string, string>;
  healthCheckInterval: number;
  restartPolicy: RestartPolicy;
  memoryLimit: string;
  cpuLimit: string;
}

export interface TaskConfig {
  priority: Priority;
  maxRetries: number;
  timeout: number;
  checkpointInterval: number;
  parallelExecution: boolean;
  dependencies: string[];
}
```

## 7. Context System Design

### 7.1 Context File Format

The context system uses `.molt.md` files placed in directories to define agent behavior. Files are merged hierarchically from root to current directory.

```markdown
---
name: project-name
version: 1.0.0
type: project | workspace | global
---

# Project Context

## Description
Brief description of the project.

## Preferred Models
coding: MiniMax 2.1
research: Gemini 3.0
creative: Opus 4.5
kimi: Kimi k2.5

## Task Instructions
- Use TypeScript for all new code
- Write unit tests for all functions
- Follow the project's coding style
- Document public APIs

## Constraints
- No console.log statements in production
- Maximum function length: 50 lines
- Use environment variables for configuration

## Worker Rules
code-worker:
  tools:
    enabled: [bash, file, git, search]
    disabled: []
  timeout: 300

research-worker:
  enabled: true
  sources: [web, documents, databases]

## Skills
- typescript
- react
- nodejs
- postgresql

## Environment Variables
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/myapp

## Context Providers
- memory: true
- skills: true
- workers: true
```

### 7.2 Context Merging Strategy

Context files are merged with later files (more specific directories) taking precedence for conflicts. The merge strategy supports:

1. **Deep Merge** - Nested objects are merged recursively.
2. **Array Concatenation** - Arrays are combined with deduplication.
3. **Override** - Scalar values are overridden by later files.

### 7.3 Context Providers

Context providers extend the context system with additional data sources:

- **Memory Provider** - Retrieves relevant memories for the context.
- **Skills Provider** - Loads available skills for the project type.
- **Workers Provider** - Configures worker availability and limits.
- **Models Provider** - Sets model preferences and overrides.
- **History Provider** - Includes past task results from the directory.

### 7.4 Context Hot Reloading

Context files are watched for changes using chokidar. When a `.molt.md` file changes:

1. The context cache is invalidated for that directory and all subdirectories.
2. Active workers are notified of the context change.
3. Workers update their context without interrupting current tasks.
4. New tasks use the updated context immediately.

## 8. Code Patterns to Reuse from OpenClaw

### 8.1 Pi Agent Framework Integration

OpenClaw's Pi agent framework integration provides a robust pattern for agent implementation.

```typescript
// Pattern: Pi Agent Runner (adapted from OpenClaw)
import { runEmbeddedPiAgent } from '@mariozechner/pi-agent-core';
import { PiSettings } from './pi-settings';

export async function runAgent(
  prompt: string,
  settings: PiSettings,
  tools: Tool[]
): Promise<AgentResult> {
  return runEmbeddedPiAgent({
    prompt,
    settings: {
      maxTurns: settings.maxTurns,
      thinking: settings.thinking,
      model: settings.model,
      temperature: settings.temperature
    },
    tools,
    sandbox: settings.sandbox,
    sessionId: settings.sessionId
  });
}
```

### 8.2 Skills as Markdown Files

The skills system uses markdown files for skill definitions, following OpenClaw's pattern.

```typescript
// Pattern: Skill Loader (adapted from OpenClaw)
import matter from 'gray-matter';

interface SkillMetadata {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  requires?: {
    bins?: string[];
    skills?: string[];
  };
}

export async function loadSkill(skillPath: string): Promise<Skill> {
  const content = await fs.readFile(skillPath, 'utf-8');
  const { data: metadata, content: instructions } = matter(content);
  
  return {
    metadata: metadata as SkillMetadata,
    instructions,
    path: skillPath
  };
}
```

### 8.3 Memory System with sqlite-vec

The vector storage pattern from OpenClaw provides efficient semantic search.

```typescript
// Pattern: Vector Storage (adapted from OpenClaw)
import Database from 'better-sqlite3';
import { cosineDistance } from 'sqlite-vec';

export class VectorStorage {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.loadExtension('sqlite-vec');
    this.initialize();
  }
  
  private initialize(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS embeddings 
      USING vec0(embedding float[1536]);
    `);
  }
  
  async search(query: number[], limit: number = 10) {
    const stmt = this.db.prepare(`
      SELECT rowid, distance
      FROM embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `);
    
    return stmt.all(JSON.stringify(query), limit);
  }
}
```

### 8.4 Daemon Backend Pattern

The cross-platform daemon pattern provides robust service management.

```typescript
// Pattern: Daemon Backend (adapted from OpenClaw)
export interface DaemonBackend {
  install(): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<DaemonStatus>;
  getLogs(options: LogOptions): Promise<string[]>;
}

export class SystemdBackend implements DaemonBackend {
  constructor(private config: DaemonConfig) {}
  
  async install(): Promise<void> {
    const unitContent = this.generateUnitFile();
    await fs.writeFile('/etc/systemd/system/molt.service', unitContent);
    await exec('systemctl daemon-reload');
    await exec('systemctl enable molt');
  }
  
  private generateUnitFile(): string {
    return `[Unit]
Description=MOLT-OS Orchestrator
After=network.target

[Service]
Type=simple
User=${this.config.user}
WorkingDirectory=${this.config.workingDir}
ExecStart=${this.config.execPath}
Restart=${this.config.restartPolicy}
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target`;
  }
}
```

### 8.5 Configuration with Zod

OpenClaw's Zod-based configuration provides type-safe, validated settings.

```typescript
// Pattern: Zod Schema (adapted from OpenClaw)
import { z } from 'zod';

const WorkerSchema = z.object({
  type: z.enum(['code', 'research', 'creative', 'data', 'system', 'kimi']),
  name: z.string().min(1).max(50),
  enabled: z.boolean().default(true),
  model: z.string().default('minimax-2.1'),
  maxConcurrentTasks: z.number().min(1).max(100).default(3),
  timeout: z.number().min(30).max(3600).default(300),
  tools: z.array(z.string()).default([])
});

export const ConfigSchema = z.object({
  workers: z.array(WorkerSchema).default([]),
  models: z.record(ModelSchema).default({}),
  context: ContextSchema.default({}),
  memory: MemorySchema.default({}),
  daemon: DaemonSchema.default({})
});

export type Config = z.infer<typeof ConfigSchema>;
```

### 8.6 Session Management with Checkpoint/Resume

The session management pattern provides reliable task continuation.

```typescript
// Pattern: Session with Checkpoint (adapted from OpenClaw)
export class SessionManager {
  async createCheckpoint(session: Session): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      state: {
        currentStep: session.state.currentStep,
        subtasks: session.state.subtasks,
        results: session.state.results,
        context: await this.getContextSnapshot()
      },
      timestamp: new Date(),
      version: session.version + 1
    };
    
    await this.storage.saveCheckpoint(checkpoint);
    return checkpoint;
  }
  
  async restoreFromCheckpoint(checkpointId: string): Promise<Session> {
    const checkpoint = await this.storage.getCheckpoint(checkpointId);
    const session = await this.getSession(checkpoint.sessionId);
    
    session.state = checkpoint.state;
    session.status = 'resumed';
    session.version = checkpoint.version;
    
    return session;
  }
}
```

### 8.7 Error Handling Pattern

OpenClaw's error handling pattern provides graceful degradation.

```typescript
// Pattern: Error Handling (adapted from OpenClaw)
export class FallbackChain<T> {
  private providers: T[] = [];
  
  add(provider: T): this {
    this.providers.push(provider);
    return this;
  }
  
  async execute<R>(
    operation: (provider: T) => Promise<R>,
    fallback: (errors: Error[]) => Promise<R>
  ): Promise<R> {
    const errors: Error[] = [];
    
    for (const provider of this.providers) {
      try {
        return await operation(provider);
      } catch (error) {
        errors.push(error);
      }
    }
    
    return fallback(errors);
  }
}
```

## 9. Agent Task Breakdown

### 9.1 Phase 1 Tasks: Core Orchestrator & Daemon

**Task 1.1: Project Setup**
- Initialize TypeScript project structure
- Configure PNPM workspace
- Set up linting and formatting
- Create package.json files for all packages
- Est. Time: 2 days

**Task 1.2: CEO Orchestrator Implementation**
- Implement CEOOrchestrator class
- Create TaskRouter component
- Build Event system
- Est. Time: 4 days

**Task 1.3: Session Management**
- Implement SessionManager
- Add checkpoint/resume functionality
- Create persistence layer
- Est. Time: 3 days

**Task 1.4: Daemon Management**
- Implement SystemdBackend (Linux)
- Implement LaunchdBackend (macOS)
- Implement SchtasksBackend (Windows)
- Create PM2 backend fallback
- Est. Time: 4 days

**Task 1.5: Health Monitoring**
- Create HealthMonitor component
- Implement health check endpoints
- Build alerting system
- Est. Time: 2 days

### 9.2 Phase 2 Tasks: Worker Agents System

**Task 2.1: Base Worker Implementation**
- Implement BaseWorker class
- Create ToolRegistry
- Build WorkerCommunication
- Est. Time: 3 days

**Task 2.2: Code Worker**
- Implement CodeWorker
- Register coding tools
- Create skill definitions
- Est. Time: 3 days

**Task 2.3: Research Worker**
- Implement ResearchWorker
- Register research tools
- Create skill definitions
- Est. Time: 3 days

**Task 2.4: Creative Worker**
- Implement CreativeWorker
- Register creative tools
- Create skill definitions
- Est. Time: 3 days

**Task 2.5: Data Worker**
- Implement DataWorker
- Register data tools
- Create skill definitions
- Est. Time: 3 days

**Task 2.6: System Worker**
- Implement SystemWorker
- Register system tools
- Create skill definitions
- Est. Time: 3 days

**Task 2.7: Kimi Worker**
- Implement KimiWorker
- Register Chinese-specific tools
- Create skill definitions
- Est. Time: 3 days

### 9.3 Phase 3 Tasks: Context Layer

**Task 3.1: Context File Format**
- Define `.molt.md` specification
- Create parser using gray-matter
- Implement schema validation
- Est. Time: 2 days

**Task 3.2: Context Loader**
- Implement recursive file search
- Build hierarchical merging
- Add caching layer
- Est. Time: 3 days

**Task 3.3: Context Manager**
- Implement ContextManager
- Create context providers
- Add hot-reloading support
- Est. Time: 3 days

**Task 3.4: Integration Tests**
- Test context merging
- Test hot-reloading
- Test provider integration
- Est. Time: 2 days

### 9.4 Phase 4 Tasks: Memory System

**Task 4.1: Vector Store**
- Implement VectorStore with sqlite-vec
- Create embedding storage
- Build search functionality
- Est. Time: 3 days

**Task 4.2: Embedding Generator**
- Create EmbeddingGenerator interface
- Implement provider integrations
- Add batching support
- Est. Time: 2 days

**Task 4.3: RAG Engine**
- Implement RAGEngine
- Build context construction
- Create query optimization
- Est. Time: 3 days

**Task 4.4: Memory Manager**
- Implement MemoryManager
- Add session memory support
- Create long-term storage
- Est. Time: 3 days

### 9.5 Phase 5 Tasks: Model Router

**Task 5.1: Model Router**
- Implement ModelRouter
- Create capability matrix
- Build selection algorithms
- Est. Time: 3 days

**Task 5.2: Kimi Provider**
- Implement KimiProvider
- Add API integration
- Create streaming support
- Est. Time: 2 days

**Task 5.3: Anthropic Provider**
- Implement AnthropicProvider
- Add Opus 4.5 integration
- Create streaming support
- Est. Time: 2 days

**Task 5.4: Google Provider**
- Implement GoogleProvider
- Add Gemini 3.0 integration
- Create streaming support
- Est. Time: 2 days

**Task 5.5: MiniMax Provider**
- Implement MiniMaxProvider
- Add MiniMax 2.1 integration
- Create streaming support
- Est. Time: 2 days

**Task 5.6: Cost Tracker**
- Implement CostTracker
- Create usage analytics
- Build budget alerts
- Est. Time: 2 days

### 9.6 Phase 6 Tasks: Frontend

**Task 6.1: Electron Setup**
- Configure Electron main process
- Create IPC handlers
- Build system tray
- Est. Time: 3 days

**Task 6.2: React Dashboard**
- Create Dashboard layout
- Build WorkersPanel
- Build ContextPanel
- Build MemoryPanel
- Build SandboxPanel
- Est. Time: 5 days

**Task 6.3: API Server**
- Implement Express routes
- Create WebSocket server
- Build authentication
- Est. Time: 3 days

**Task 6.4: Frontend Integration**
- Connect frontend to API
- Implement real-time updates
- Add error handling
- Est. Time: 3 days

### 9.7 Phase 7 Tasks: Integration & Testing

**Task 7.1: Integration Tests**
- Create E2E test suite
- Test worker communication
- Test context propagation
- Test memory retrieval
- Est. Time: 4 days

**Task 7.2: Performance Testing**
- Benchmark task execution
- Test concurrent workers
- Measure memory usage
- Est. Time: 2 days

**Task 7.3: Security Audit**
- Review API security
- Check authentication
- Audit permissions
- Est. Time: 2 days

**Task 7.4: Documentation**
- Write user documentation
- Create API documentation
- Build deployment guide
- Est. Time: 3 days

### 9.8 Total Effort Estimate

| Phase | Tasks | Total Days |
|-------|-------|------------|
| Phase 1: Core Orchestrator & Daemon | 5 | 15 days |
| Phase 2: Worker Agents System | 7 | 21 days |
| Phase 3: Context Layer | 4 | 10 days |
| Phase 4: Memory System | 4 | 11 days |
| Phase 5: Model Router | 6 | 13 days |
| Phase 6: Frontend | 4 | 14 days |
| Phase 7: Integration & Testing | 4 | 11 days |
| **Total** | **34** | **95 days** |

## 10. Implementation Notes

### 10.1 Development Workflow

1. Start with Phase 1 to establish the core infrastructure.
2. Build workers in parallel with context and memory systems.
3. Integrate frontend last after all backends are stable.
4. Use feature flags to enable/disable incomplete features.

### 10.2 Testing Strategy

- Unit tests: Test individual components in isolation.
- Integration tests: Test component interactions.
- E2E tests: Test complete user workflows.
- Performance tests: Measure system throughput.
- Load tests: Test concurrent user scenarios.

### 10.3 Deployment Considerations

- Use Docker for consistent environments.
- Implement graceful shutdown handlers.
- Configure log aggregation.
- Set up monitoring and alerting.
- Create backup and restore procedures.

### 10.4 Future Extensions

- Additional worker types (e.g., DevOps, Security).
- Cloud provider integrations.
- Multi-orchestrator federation.
- Advanced skill learning system.
- Custom model fine-tuning pipeline.
