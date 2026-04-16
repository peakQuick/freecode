# FreeCode: Agentic Development Assistant

An agentic wrapper around Gemma/Gemini with extended thinking, tool-calling loops, context compaction, and a beautiful terminal UI.

## Architecture

```
agent_core/           # Pure agentic logic (testable, framework-agnostic)
├── agent.py         # Main Agent class with tool-calling loop
├── state.py         # Session state management
├── tools/           # Tool definitions & registry
├── compaction.py    # Context compaction logic
└── __init__.py

backend/             # WebSocket server wrapper
├── server.py        # Async WebSocket handler
├── message_types.py # Protocol definitions
└── requirements.txt

web/                 # Next.js frontend
├── src/app/page.tsx # Main chat UI (Pure React)
└── ...
```

## Features

✅ **Tool-calling loop** — Model calls tools → execute → feed result → recurse  
✅ **Extended thinking** — Gemma's thinking mode streamed to UI in real-time  
✅ **Context compaction** — Auto-summarize history when approaching token limits  
✅ **State tracking** — Session state, task queue, file modifications  
✅ **WebSocket streaming** — Full-duplex protocol for thinking, tools, tokens  
✅ **Pluggable API** — Swap Gemini for Claude/OpenRouter/etc in `agent_core/`  
✅ **Modern React UI** — Full-screen chat with command palette, directory picker, and live context bar  

## Quick Start

**Windows:**
```
start.bat
```

**macOS/Linux/WSL:**
```bash
bash start.sh
```

First run installs dependencies automatically, then launches the app.  
Open http://localhost:3000 — onboarding will guide you through the rest.

### 3. Complete Onboarding

On first launch, the app will show an onboarding modal:
1. **Step 1:** Enter your Gemini API key (get one from https://aistudio.google.com)
2. **Step 2:** Select where to store FreeCode settings and sessions

After onboarding, you'll be prompted to select a working folder for your project.

**Note:** You can reconfigure settings anytime by clicking the ⚙ (gear) icon in the status bar.

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- Gemini API key (from https://aistudio.google.com)

## Manual Setup (if setup script fails)

If the setup script doesn't work, follow these steps manually:

```bash
# Create Python venv
python -m venv venv
source venv/Scripts/activate  # Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Setup frontend
cd web
npm install
cp .env.local.example .env.local
```

## Usage

The terminal UI accepts natural language commands. Examples:

```
> list files in current directory
> read package.json and summarize it
> create a new python script that validates email addresses
> run npm test and show me any failures
```

The agent will:
1. Think about what you asked (cyan thinking stream)
2. Call tools as needed (filesystem, shell)
3. Show results in real-time
4. Iterate until the task is complete

## Message Protocol (WebSocket)

**Client → Server:**
```json
{
  "type": "user_input", 
  "text": "your request here",
  "effort": "MEDIUM",
  "working_dir": "C:/path/to/project"
}
```

**Server → Client (streaming):**
```json
{"type": "thinking", "chunk": "...thinking..."}
{"type": "tool_call", "tool_name": "filesystem", "tool_args": {...}}
{"type": "tool_result", "tool_name": "filesystem", "result": "..."}
{"type": "response", "chunk": "...response text..."}
{"type": "done", "tokens_used": 1234, "token_limit": 100000, "context_pct": 1.2}
```

## Extending with Tools

To add a new tool, create a class in `agent_core/tools/` that extends `BaseTool`:

```python
from .base import BaseTool, ToolDefinition

class MyTool(BaseTool):
    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="my_tool",
            description="What it does",
            parameters={
                "type": "object",
                "properties": {...},
                "required": [...]
            }
        )

    async def execute(self, **kwargs) -> str:
        # Do work here
        return "result"
```

Then register it in `Agent.__init__()`:

```python
self.tools.register(MyTool())
```

## Swapping APIs

To use Claude instead of Gemini, modify `agent_core/agent.py`:

```python
from anthropic import Anthropic  # instead of google.genai

# Update model calls to use Anthropic SDK
```

The rest of the system (tools, compaction, WebSocket) works the same.