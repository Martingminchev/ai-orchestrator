# Tasks to Compare Normal vs Orchestrator Mode

## 🎯 Best Demonstration Tasks

These tasks are specifically chosen to show clear differences between single-agent and orchestrated execution.

---

## Task 1: Multi-Source Research (⭐ BEST DEMO)

### Task:
```
Research and compare 3 different authentication libraries for Node.js. 
For each library, find: installation steps, basic usage example, 
pros and cons, and GitHub stars. Then create a comparison table.
```

### Normal Mode Behavior:
- Agent researches libraries **sequentially** (one at a time)
- Takes ~3-5 minutes total
- May lose context between libraries
- Single context window gets cluttered

### Orchestrator Mode Behavior:
- **Plans**: Identifies 3 independent research tasks + 1 aggregation task
- **Dispatches**: 3 parallel subagents research each library simultaneously
- **Aggregates**: Final subagent creates comparison table from all results
- Takes ~1-2 minutes total (3x faster!)
- Each subagent has clean, focused context
- Better quality results due to parallel execution

### Expected Output Difference:
- **Normal**: "I researched Passport.js... now let me research JWT... now let me research Auth0..."
- **Orchestrator**: "Researching Passport.js, JWT, and Auth0 in parallel... [3 subagents working] ... Here's the comparison table"

---

## Task 2: Codebase Analysis (Great for Real Projects)

### Task:
```
Analyze the codebase structure. For each major directory (src/, tests/, docs/), 
identify: main purpose, key files, dependencies, and suggest one improvement. 
Then create a summary document.
```

### Normal Mode Behavior:
- Analyzes directories one by one
- Context accumulates, may get confused
- May miss connections between directories
- Takes longer as it reads files sequentially

### Orchestrator Mode Behavior:
- **Plans**: Separate analysis tasks for each directory + summary task
- **Dispatches**: Parallel analysis of src/, tests/, docs/ simultaneously
- **Aggregates**: Creates comprehensive summary from all analyses
- Each subagent focuses on one directory (cleaner analysis)
- Faster execution (parallel file reading)
- Better insights due to focused context

### Expected Output Difference:
- **Normal**: Long sequential analysis, may repeat information
- **Orchestrator**: Structured analysis per directory, then synthesized summary

---

## Task 3: Full-Stack Feature (Shows Dependency Handling)

### Task:
```
Create a user registration feature: design the database schema, 
implement the backend API endpoint, create the frontend form, 
add validation, and write tests for each component.
```

### Normal Mode Behavior:
- Tries to do everything in one go
- May mix concerns (database + frontend in same context)
- May skip steps or do them out of order
- Harder to track progress

### Orchestrator Mode Behavior:
- **Plans**: Identifies dependencies (schema → backend → frontend → tests)
- **Dispatches**: 
  - Step 1: Database schema (no dependencies)
  - Step 2: Backend API (depends on schema)
  - Step 3: Frontend form (depends on backend)
  - Step 4: Tests (depends on all)
- **Aggregates**: Final summary of complete feature
- Each step has focused context
- Proper dependency ordering ensures correctness

### Expected Output Difference:
- **Normal**: May create frontend before backend, causing errors
- **Orchestrator**: Proper order: schema → backend → frontend → tests

---

## Task 4: Documentation Generation

### Task:
```
Generate documentation for the project: create README with setup 
instructions, write API documentation for all endpoints, create 
architecture diagram description, and write a changelog.
```

### Normal Mode Behavior:
- Creates docs sequentially
- May forget to include details from earlier docs
- Single context may mix different documentation styles
- Takes longer

### Orchestrator Mode Behavior:
- **Plans**: 4 parallel documentation tasks (README, API docs, architecture, changelog)
- **Dispatches**: All 4 subagents work simultaneously
- **Aggregates**: Combines all documentation
- Each subagent specializes in one doc type
- Faster completion
- More consistent quality

---

## Task 5: Multi-Step Refactoring

### Task:
```
Refactor the codebase: identify code smells, create refactoring plan, 
refactor backend code, refactor frontend code, update tests, and 
update documentation.
```

### Normal Mode Behavior:
- Does everything sequentially
- May lose track of what needs refactoring
- Context gets cluttered with all code changes
- May miss updating tests/docs

### Orchestrator Mode Behavior:
- **Plans**: Analysis → Planning → Backend refactor → Frontend refactor → Tests → Docs
- **Dispatches**: Proper dependency order (can't refactor before planning)
- **Aggregates**: Complete refactoring summary
- Each step is isolated and focused
- Less likely to miss steps

---

## 🧪 Quick Comparison Test

### Simple Test Script:

**Without Orchestrator:**
```bash
node scripts/run-node.mjs gateway
# Send task via UI or WebSocket
```

**With Orchestrator:**
```bash
node scripts/run-node.mjs gateway --orchestrator
# Send same task via UI or WebSocket
```

### What to Look For:

1. **Execution Time**: Orchestrator should be faster for parallelizable tasks
2. **Log Output**: 
   - Normal: Single agent run
   - Orchestrator: Multiple subagent runs with planning/dispatch logs
3. **Context Quality**: Orchestrator keeps contexts clean per subagent
4. **Error Handling**: Orchestrator can retry individual steps
5. **Progress Visibility**: Orchestrator shows step-by-step progress

---

## 📊 Expected Performance Differences

| Task Type | Normal Mode | Orchestrator Mode | Speedup |
|-----------|-------------|-------------------|---------|
| Single-step task | Fast | Similar | ~1x |
| 3 parallel research tasks | ~3-5 min | ~1-2 min | **2-3x** |
| 5-step sequential task | ~5-10 min | ~5-8 min | **1.2-1.5x** |
| Complex multi-component | ~10-15 min | ~4-6 min | **2-3x** |

---

## 💡 Pro Tips for Testing

1. **Start with Task 1** (Multi-Source Research) - easiest to see the difference
2. **Check the logs** - orchestrator logs show planning → dispatch → completion
3. **Watch for parallel execution** - multiple subagents running simultaneously
4. **Compare result quality** - orchestrator often produces better results due to focused contexts
5. **Test error scenarios** - orchestrator can retry failed steps independently

---

## 🎬 Demo Script

For a live demo, use this sequence:

1. **Show Normal Mode**: Run simple task, show sequential execution
2. **Show Orchestrator Mode**: Run same task, show parallel execution in logs
3. **Compare Results**: Show how orchestrator is faster and produces better structured output
4. **Show Planning**: Demonstrate how orchestrator breaks down complex tasks
5. **Show Dependency Handling**: Use Task 3 to show proper ordering
