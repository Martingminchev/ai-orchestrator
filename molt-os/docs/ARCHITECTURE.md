# Architecture Documentation

## Overview

MOLT-OS uses a modular architecture with clear separation of concerns between components.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOLT-OS CLI/UI                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestrator (Port 3002)                    │
│  • Task coordination                                             │
│  • IPC message routing                                           │
│  • Context management                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Worker (Port 3000)    │     │   Planner (Port 3001)   │
│  • Task execution        │     │  • Plan generation      │
│  • Subagent management   │     │  • Plan refinement       │
│  • Parallel processing   │     │  • Research             │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               │
    ┌─────────────────┐                       │
    │   Subagents      │                       │
    │  • execute       │◄──────────────────────┘
    │  • tools         │
    └─────────────────┘
```

## Data Flow

1. Task arrives at Orchestrator
2. Orchestrator loads context
3. Task dispatched to Worker
4. Worker requests plan from Planner
5. Planner generates/refines plan
6. Worker executes subagents per plan
7. Results aggregated and returned

## File Structure

### Context System

```
context/
├── loader.ts          # File loading
├── hierarchy.ts        # Hierarchical context
├── in-memory.ts        # In-memory caching
└── types.ts            # Type definitions
```

### IPC System

```
ipc/
├── types.ts           # Message types
└── channels.ts        # Channel definitions
```

## Error Handling Flow

```
┌─────────────┐
│   Error     │
│   Occurs    │
└──────┬──────┘
       ▼
┌─────────────┐
│   Error     │◄── Check if MoltError
│  Handler    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Recoverable?│─Yes─┤   Attempt   │
└──────┬──────┘     │  Recovery   │
        │No          └──────┬──────┘
        ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Log &     │     │  Recovery   │
│   Exit      │     │  Success?   │
└─────────────┘     └──────┬──────┘
                           │No
                           ▼
                    ┌─────────────┐
                    │  Log &      │
                    │  Continue   │
                    └─────────────┘
```

## Context Hierarchy

```
Project Root
│
├── .molt/global.md          (Global Context - Highest Priority)
│
├── .molt.md                 (Location Context)
│   ├── subdir/.molt.md     (Location Context)
│   │   └── subsubdir/       (No context here)
│   └── other.md
│
└── skills/                   (Skill Contexts)
    ├── code.md
    ├── research.md
    └── write.md
```

## Memory System

```
memory/
├── index.ts            # Memory Manager
├── storage.ts          # SQLite storage
└── types.ts            # Memory types
```

### Namespaces

| Namespace | TTL | Purpose          |
| --------- | --- | ---------------- |
| context   | 24h | Context data     |
| result    | 7d  | Task results     |
| cache     | 1h  | Cache data       |
| session   | 24h | Session data     |
| state     | ∞   | Persistent state |

## Daemon System

```
daemon/
├── index.ts           # Daemon entry
├── schtasks.ts        # Windows Task Scheduler
└── types.ts           # Daemon types
```

### Windows Task Scheduler Integration

```
schtasks /Create
  /TN "MOLT-OS Daemon"
  /SC ONSTART
  /DELAY 0005
  /TR "path\to\daemon.js"
  /RL HIGHEST
```
