# CLAUDE.md

This file provides guidelines for Claude Code (and other AI assistants) working with MOLT-OS.

## Project Overview

MOLT-OS is a modular LLM orchestration framework built with TypeScript and Electron. It coordinates multiple AI agents for complex task execution.

## Key Principles

1. **Modularity First**: Keep components loosely coupled and independently testable
2. **Type Safety**: Use TypeScript strict mode; avoid `any` types
3. **No Unnecessary Comments**: Code should be self-documenting
4. **Error Handling**: Always use the error handling system (`src/error/`)
5. **Logging**: Use the structured logger (`src/utils/logger.ts`)

## Code Style

- ESM modules (`.js` extension in imports)
- Interfaces over type aliases for object types
- Async/await over callbacks
- Named exports for modules
- PascalCase for types and interfaces
- camelCase for variables and functions

## Directory Structure

```
src/
├── index.ts          # Unified entry point
├── cli.ts            # CLI mode
├── electron.ts       # Electron mode
├── daemon.ts         # Daemon mode
├── error/            # Error handling
│   ├── index.ts
│   ├── handler.ts
│   ├── recovery.ts
│   └── types.ts
├── memory/           # Memory management
│   ├── index.ts
│   ├── storage.ts
│   └── types.ts
├── utils/            # Utilities
│   └── logger.ts
├── context/          # Context loading
├── orchestrator/     # Orchestrator
├── worker/           # Worker
├── planner/          # Planner
├── ipc/              # IPC types
└── daemon/           # Windows daemon
```

## Error Handling

Always use the error system:

```typescript
import { MoltError, MoltErrorCode } from "./error/types.js";

// Create typed errors
throw new MoltError({
  code: MoltErrorCode.WORKER_ERROR,
  message: "Worker failed",
  recoverable: true,
});

// Check for errors
import { isMoltError } from "./error/types.js";
if (isMoltError(error)) {
  // handle
}
```

## Logging

```typescript
import { getLogger, createChildLogger } from "./utils/logger.js";

const logger = getLogger();
logger.info("Message", { context });

const childLogger = createChildLogger("component-name");
```

## Testing

- Use Vitest for all tests
- Unit tests: `src/**/*.test.ts`
- Integration tests: `tests/integration/**/*.test.ts`
- E2E tests: `tests/e2e/**/*.test.ts`

## Build Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build TypeScript
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm format           # Format code
```

## Import Patterns

```typescript
// Internal modules
import { functionName } from "./utils/filename.js";
import { TypeName } from "./types.js";

// External packages
import { something } from "package-name";
```

## Common Tasks

### Adding a New Component

1. Create types in appropriate `types.ts`
2. Implement in main file
3. Export from `index.ts`
4. Add tests
5. Update documentation

### Adding a New Error Type

1. Add to `MoltErrorCode` enum in `src/error/types.ts`
2. Add recovery strategy in `src/error/recovery.ts` if applicable
3. Add tests

### Modifying IPC Protocol

1. Update types in `src/ipc/types.ts`
2. Update handlers in relevant components
3. Add integration tests
