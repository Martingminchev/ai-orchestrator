# AI Orchestrator

A multi-agent AI orchestration system powered by Kimi K2.5 (Moonshot API).

## Overview

This system allows you to:
- Submit complex tasks to an AI orchestrator
- The orchestrator analyzes tasks and spawns specialized sub-agents
- Up to 5 agents work in parallel on different aspects of the task
- Results are synthesized into a comprehensive final answer
- Track token usage per agent and accumulated totals

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Chat UI    │  │  Agent Dashboard │  │  Token Tracker     │  │
└────────────────────────────┬────────────────────────────────────┘
                             │ SSE (streaming)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATOR AGENT                     │   │
│  │  - Analyzes tasks and decomposes into subtasks            │   │
│  │  - Spawns specialized sub-agents                          │   │
│  │  - Synthesizes final responses                            │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │ spawns/manages                                 │
│  ┌──────────────▼───────────────────────────────────────────┐   │
│  │              SUB-AGENTS (up to 5 concurrent)              │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────┐ │   │
│  │  │Explorer │ │Reviewer │ │Analyst  │ │Writer   │ │Coder│ │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Roles

| Role | Description |
|------|-------------|
| **Explorer** | Research, investigation, gathering information |
| **Reviewer** | Critical analysis, feedback, quality assessment |
| **Analyst** | Data analysis, pattern recognition, insights |
| **Writer** | Content creation, documentation, summarization |
| **Coder** | Writing code, debugging, technical implementation |

## Quick Start

### Prerequisites
- Node.js 18+ 
- A Moonshot API key from https://platform.moonshot.ai

### Installation

```bash
# Clone and navigate to the project
cd ai-orchestrator

# Install all dependencies
npm run install:all
```

### Running the Application

**Option 1: Run both server and client (development)**
```bash
npm run dev
```

**Option 2: Run separately**

Terminal 1 (Backend):
```bash
cd server
npm run dev
```

Terminal 2 (Frontend):
```bash
cd client
npm run dev
```

### Access the App

1. Open http://localhost:5173 in your browser
2. Enter your Moonshot API key when prompted
3. Submit a task and watch the orchestrator work!

## Example Tasks

Try these prompts to see the orchestrator in action:

1. **Research Task**: "Research the top 3 JavaScript frameworks and create a comparison table"

2. **Analysis Task**: "Analyze the pros and cons of microservices vs monolithic architecture for a startup"

3. **Creative Task**: "Write a blog post about the future of AI with supporting research"

4. **Technical Task**: "Design a REST API for a todo application with authentication"

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Check if API key is configured |
| `POST` | `/api/config` | Save Moonshot API key |
| `POST` | `/api/task` | Submit a new task |
| `GET` | `/api/stream/:taskId` | SSE stream for task events |
| `GET` | `/api/tokens` | Get token usage statistics |
| `POST` | `/api/cancel/:taskId` | Cancel a running task |

## Token Tracking

The system tracks token usage:
- **Per Agent**: Each sub-agent's prompt and completion tokens
- **Orchestrator**: Tokens used for task analysis and synthesis
- **Accumulated**: Total tokens across all agents and orchestrator

Token stats are displayed in real-time in the UI sidebar.

## Project Structure

```
ai-orchestrator/
├── package.json              # Root package.json
├── README.md                 # This file
├── .env.example              # Environment variables template
│
├── server/                   # Backend (Express.js)
│   ├── index.js              # Server entry point
│   ├── routes/api.js         # API routes
│   ├── services/
│   │   ├── kimi.js           # Moonshot API client
│   │   └── tokenTracker.js   # Token usage tracking
│   └── agents/
│       ├── orchestrator.js   # Main orchestrator logic
│       ├── subagent.js       # Sub-agent implementation
│       └── prompts.js        # System prompts
│
└── client/                   # Frontend (React + Vite)
    ├── src/
    │   ├── App.jsx           # Main app component
    │   ├── App.css           # Styles
    │   └── components/
    │       ├── Chat.jsx          # Chat interface
    │       ├── AgentDashboard.jsx # Agent status display
    │       ├── TokenStats.jsx     # Token usage display
    │       └── ApiKeyModal.jsx    # API key configuration
    └── vite.config.js        # Vite configuration
```

## Customization

### Changing the Model
Edit `server/agents/orchestrator.js` and `server/agents/subagent.js`:
```javascript
const KIMI_MODEL = 'moonshot-v1-32k'; // or 'moonshot-v1-8k' for faster/cheaper
```

### Adding New Agent Roles
Edit `server/agents/prompts.js` to add new roles to `SUBAGENT_SYSTEM_PROMPTS`.

### Adjusting Max Agents
Edit `server/agents/orchestrator.js`:
```javascript
const MAX_AGENTS = 5; // Change to desired maximum
```

## License

MIT
