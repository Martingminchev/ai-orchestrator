---
name: research-agent
description: Perform web research, information gathering, and content analysis for MOLT-OS
metadata:
  {
    "molt-os":
      {
        "emoji": "🔍",
        "capabilities":
          [
            "Web search for information",
            "Fetch and parse web pages",
            "Summarize content",
            "Extract links and references",
            "Find specific information",
          ],
      },
  }
---

# Research Agent

The Research Agent handles all web research and information gathering operations for MOLT-OS.

## Capabilities

- **Web Search**: Search the web for information using various search providers
- **Fetch Pages**: Retrieve and parse web page content
- **Summarize**: Generate concise summaries of content
- **Extract Links**: Extract and categorize links from pages
- **Find Information**: Locate specific information within content

## Guidelines

- Verify information from multiple sources when possible
- Respect robots.txt and terms of service
- Handle rate limiting gracefully
- Provide citations for sourced information
- Focus on accuracy and relevance
- Distinguish between facts and opinions

## Tools

### web_search

Search the web for information.

**Input:**

```json
{
  "query": "string (required)",
  "numResults": number,
  "type": "general | news | academic"
}
```

**Output:**

```json
{
  "success": true,
  "results": [
    {
      "title": "string",
      "url": "string",
      "snippet": "string"
    }
  ]
}
```

### fetch_page

Fetch and parse a web page.

**Input:**

```json
{
  "url": "string (required)",
  "extractText": boolean,
  "timeout": number
}
```

**Output:**

```json
{
  "success": true,
  "content": "string",
  "metadata": {
    "title": "string",
    "links": ["string"],
    "images": ["string"]
  }
}
```

### summarize

Generate a summary of content.

**Input:**

```json
{
  "content": "string (required)",
  "length": "short | medium | long",
  "focus": "string"
}
```

**Output:**

```json
{
  "success": true,
  "summary": "string",
  "keyPoints": ["string"]
}
```

### extract_links

Extract and categorize links from a page.

**Input:**

```json
{
  "content": "string (required)",
  "types": ["internal" | "external" | "pdf" | "image"]
}
```

**Output:**

```json
{
  "success": true,
  "links": [
    {
      "url": "string",
      "text": "string",
      "type": "string"
    }
  ]
}
```

### find_information

Find specific information within content.

**Input:**

```json
{
  "content": "string (required)",
  "query": "string (required)",
  "context": number
}
```

**Output:**

```json
{
  "success": true,
  "matches": [
    {
      "text": "string",
      "context": "string",
      "position": number
    }
  ]
}
```

## Usage Example

```typescript
const agent = new ResearchAgent();
const result = await agent.execute({
  id: "task-1",
  agentType: "research",
  prompt: "Research the latest developments in TypeScript 5.0",
  context: {
    cwd: "/project",
  },
});
```
