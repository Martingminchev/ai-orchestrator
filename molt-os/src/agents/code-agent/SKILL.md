---
name: code-agent
description: Perform code analysis, editing, refactoring, and generation for MOLT-OS
metadata:
  {
    "molt-os":
      {
        "emoji": "💻",
        "capabilities":
          [
            "Read and analyze code",
            "Edit and refactor code",
            "Find patterns in code",
            "Generate new code",
            "Run tests and linting",
          ],
      },
  }
---

# Code Agent

The Code Agent handles all code-related operations for MOLT-OS, including reading, editing, refactoring, and analyzing code.

## Capabilities

- **Read Code**: Read and analyze source code files
- **Edit Code**: Make targeted edits to code files
- **Refactor Code**: Improve code structure and quality
- **Find Patterns**: Search for patterns and anti-patterns
- **Analyze Code**: Static analysis and code quality checks
- **Generate Code**: Generate new code based on requirements
- **Run Tests**: Execute test suites
- **Lint Code**: Run linters and fix issues

## Guidelines

- Follow language-specific best practices
- Maintain code style consistency
- Write tests for new code
- Provide clear explanations of changes
- Consider performance implications
- Handle edge cases appropriately
- Document complex logic

## Tools

### read_code

Read and analyze code files.

**Input:**

```json
{
  "path": "string (required)",
  "language": "string"
}
```

**Output:**

```json
{
  "success": true,
  "content": "string",
  "ast": object
}
```

### edit_code

Make targeted edits to code files.

**Input:**

```json
{
  "path": "string (required)",
  "oldCode": "string (required)",
  "newCode": "string (required)"
}
```

**Output:**

```json
{
  "success": true,
  "path": "string"
}
```

### refactor_code

Refactor code for better quality.

**Input:**

```json
{
  "path": "string (required)",
  "type": "extract-function | rename | move | inline | simplify",
  "target": "string"
}
```

**Output:**

```json
{
  "success": true,
  "changes": ["string"]
}
```

### find_patterns

Find patterns in code.

**Input:**

```json
{
  "pattern": "string (required)",
  "path": "string",
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

### analyze_code

Analyze code for quality and issues.

**Input:**

```json
{
  "path": "string (required)",
  "rules": ["string"]
}
```

**Output:**

```json
{
  "success": true,
  "issues": [
    {
      "severity": "error | warning | info",
      "message": "string",
      "line": number
    }
  ]
}
```

### generate_code

Generate new code based on requirements.

**Input:**

```json
{
  "specification": "string (required)",
  "language": "string",
  "template": "string"
}
```

**Output:**

```json
{
  "success": true,
  "code": "string"
}
```

### run_tests

Run test suites.

**Input:**

```json
{
  "pattern": "string",
  "verbose": boolean
}
```

**Output:**

```json
{
  "success": true,
  "passed": number,
  "failed": number,
  "output": "string"
}
```

### lint_code

Run linters and fix issues.

**Input:**

```json
{
  "path": "string (required)",
  "fix": boolean
}
```

**Output:**

```json
{
  "success": true,
  "issues": ["string"]
}
```

## Usage Example

```typescript
const agent = new CodeAgent();
const result = await agent.execute({
  id: "task-1",
  agentType: "code",
  prompt: "Refactor the user authentication module to use a factory pattern",
  context: {
    cwd: "/project",
    files: ["/project/src/auth.ts"],
  },
});
```
