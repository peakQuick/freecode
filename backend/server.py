"""WebSocket server for agent backend."""

import asyncio
import json
from pathlib import Path
import logging
from datetime import datetime
import websockets

# Add parent to path so we can import agent_core
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent_core import Agent
from .message_types import MessageType, ClientMessage, ServerMessage

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import json as _json
_ROOT = Path(__file__).parent.parent

def _get_config_path() -> Path:
    """Get freecode.json path from settings folder or repo root."""
    home = Path.home()
    default_settings = home / ".freecode"

    # Check if freecode.json exists in default location
    if (default_settings / "freecode.json").exists():
        return default_settings / "freecode.json"

    # Check repo root as fallback
    if (_ROOT / "freecode.json").exists():
        return _ROOT / "freecode.json"

    # Default: save to settings folder
    return default_settings / "freecode.json"

_CONFIG_PATH = _get_config_path()

# ── Session persistence ───────────────────────────────────────────────────────

def _sessions_dir(working_dir: str) -> Path:
    return Path(working_dir).resolve() / ".freecode" / "sessions"

def _session_path(working_dir: str, session_id: str) -> Path:
    return _sessions_dir(working_dir) / f"{session_id}.json"

def save_session_to_disk(session_id: str, working_dir: str, name: str, messages: list, model: str):
    try:
        d = _sessions_dir(working_dir)
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{session_id}.json"
        existing = {}
        if path.exists():
            try:
                existing = _json.loads(path.read_text())
            except Exception:
                pass
        existing.update({
            "id": session_id,
            "name": name,
            "working_dir": str(Path(working_dir).resolve()),
            "model": model,
            "messages": messages,
            "updated_at": datetime.now().isoformat(),
        })
        if "created_at" not in existing:
            existing["created_at"] = existing["updated_at"]
        path.write_text(_json.dumps(existing, indent=2))
    except Exception as e:
        logger.warning(f"Could not save session {session_id}: {e}")

def load_session_from_disk(working_dir: str, session_id: str) -> dict | None:
    try:
        path = _session_path(working_dir, session_id)
        if path.exists():
            return _json.loads(path.read_text())
    except Exception as e:
        logger.warning(f"Could not load session {session_id}: {e}")
    return None

def list_sessions_from_disk(working_dir: str) -> list:
    try:
        d = _sessions_dir(working_dir)
        if not d.exists():
            return []
        sessions_list = []
        for f in sorted(d.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                data = _json.loads(f.read_text())
                sessions_list.append({
                    "id": data.get("id"),
                    "name": data.get("name", "Session"),
                    "updated_at": data.get("updated_at"),
                    "working_dir": data.get("working_dir"),
                    "model": data.get("model"),
                })
            except Exception:
                pass
        return sessions_list
    except Exception as e:
        logger.warning(f"Could not list sessions for {working_dir}: {e}")
        return []


def _save_working_dir(path: str):
    try:
        try:
            cfg = _json.loads(_CONFIG_PATH.read_text())
        except (FileNotFoundError, _json.JSONDecodeError):
            cfg = {}
        recents = [path] + [d for d in cfg.get("recent_dirs", []) if d != path]
        cfg["working_dir"] = path
        cfg["recent_dirs"] = recents[:5]
        _CONFIG_PATH.write_text(_json.dumps(cfg, indent=2))
    except Exception as e:
        logger.warning(f"Could not save working_dir to freecode.json: {e}")


# Load config from freecode.json
def _load_config() -> dict:
    try:
        if _CONFIG_PATH.exists():
            return _json.loads(_CONFIG_PATH.read_text())
    except Exception:
        pass
    return {}

_cfg = _load_config()
API_KEY = _cfg.get("api_key")
MODEL = _cfg.get("model", "gemma-4-26b-a4b-it")
THINKING = _cfg.get("thinking", True)
WORKING_DIR = _cfg.get("working_dir", ".")
PORT = int(_cfg.get("backend_port", 8000))
HOST = _cfg.get("backend_host", "localhost")


async def pick_directory_async():
    """Open a modern Windows folder picker and return the path."""
    ps_cmd = """
    Add-Type -AssemblyName System.Windows.Forms
    $f = New-Object System.Windows.Forms.OpenFileDialog
    $f.ValidateNames = $false
    $f.CheckFileExists = $false
    $f.CheckPathExists = $true
    $f.FileName = "Select Folder"
    if($f.ShowDialog() -eq "OK"){
        (Split-Path -Parent $f.FileName)
    }
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "powershell", "-Command", ps_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        path = stdout.decode().strip()
        if path.endswith("Select Folder"):
            path = path.replace("Select Folder", "").strip("\\").strip("/")
        return path
    except Exception as e:
        logger.error(f"Failed to open folder picker: {e}")
        return ""


class AgentSession:
    """Manages a single agent session with its own conversation history."""

    def __init__(self, session_id: str, working_dir: str = None):
        self.session_id = session_id
        self.agent = Agent(
            api_key=API_KEY,
            model=MODEL,
            working_dir=working_dir or WORKING_DIR,
            enable_thinking=THINKING,
        )
        self.active = False
        self.created_at = datetime.now()
        self.last_seen = datetime.now()

    async def process_input(self, user_input: str, effort: str = "MEDIUM", working_dir: str = ".", model: str = None):
        """Process user input and yield events, saving session to disk after each response."""
        self.active = True
        self.last_seen = datetime.now()
        if working_dir and working_dir != ".":
            _save_working_dir(working_dir)
        try:
            async for event in self.agent.process_input(user_input, effort=effort, working_dir=working_dir, model=model):
                yield event
            # Persist session history to project directory after response
            wdir = working_dir if working_dir and working_dir != "." else str(self.agent.state.working_dir)
            msgs = [{"role": m.role, "content": m.content} for m in self.agent.state.messages]
            name = next((m["content"][:40] for m in msgs if m["role"] == "user"), "Session")
            save_session_to_disk(self.session_id, wdir, name, msgs, model or MODEL)
        finally:
            self.active = False


# Global sessions — keyed by session_id (UUID from client)
sessions: dict[str, AgentSession] = {}
MAX_SESSIONS = 20


def _get_or_create_session(session_id: str, working_dir: str = None) -> AgentSession:
    """Return existing session or create a new one. Evicts oldest if cap exceeded."""
    if session_id in sessions:
        sessions[session_id].last_seen = datetime.now()
        return sessions[session_id]

    if len(sessions) >= MAX_SESSIONS:
        oldest = min(sessions, key=lambda k: sessions[k].last_seen)
        logger.info(f"Evicting oldest session: {oldest}")
        del sessions[oldest]

    session = AgentSession(session_id, working_dir=working_dir)
    # Restore history from disk if available
    if working_dir:
        saved = load_session_from_disk(working_dir, session_id)
        if saved and saved.get("messages"):
            from agent_core.state import Message
            session.agent.state.messages = [
                Message(role=m["role"], content=m["content"])
                for m in saved["messages"]
            ]
            logger.info(f"Restored {len(session.agent.state.messages)} messages for {session_id}")
    sessions[session_id] = session
    logger.info(f"Created session: {session_id} (total: {len(sessions)})")
    return session


async def handle_client(websocket):
    """Handle a single WebSocket client connection."""
    session_id = None
    session = None

    try:
        # Announce we're alive and provide recent dirs from config
        recents = []
        try:
            if _CONFIG_PATH.exists():
                cfg = json.loads(_CONFIG_PATH.read_text())
                recents = cfg.get("recent_dirs", [])
        except Exception:
            pass

        await websocket.send(json.dumps({
            "type": "hello", 
            "server": "freecode-backend",
            "recent_dirs": recents
        }))

        async for raw_message in websocket:
            try:
                data = json.loads(raw_message)
                msg = ClientMessage.from_json(data)

                # Resolve session from client-provided session_id
                client_session_id = data.get("session_id") or "default"
                if session is None or session_id != client_session_id:
                    session_id = client_session_id
                    working_dir_hint = data.get("working_dir") or WORKING_DIR
                    session = _get_or_create_session(session_id, working_dir=working_dir_hint)

                    # Acknowledge session and broadcast current working dir
                    await websocket.send(json.dumps({
                        "type": "session",
                        "session_id": session_id,
                    }))
                    await send_system(websocket, f"Working directory: {session.agent.state.working_dir}")

                if msg.type == MessageType.USER_INPUT:
                    if not msg.text:
                        await send_error(websocket, "user_input requires 'text' field")
                        continue

                    # Internal init ping — just registers session + working dir, no response needed
                    if msg.text == "__init__":
                        logger.info(f"[{session_id}] Session initialized, working_dir={session.agent.state.working_dir}")
                        continue

                    logger.info(f"[{session_id}] User input: {msg.text[:60]}...")

                    effort = msg.effort or "MEDIUM"
                    working_dir = msg.working_dir or str(session.agent.state.working_dir)
                    model = msg.model or MODEL
                    async for event in session.process_input(msg.text, effort=effort, working_dir=working_dir, model=model):
                        server_msg = _event_to_server_message(event)
                        await websocket.send(json.dumps(server_msg.to_json()))

                elif msg.type == MessageType.CANCEL:
                    if session and session.active:
                        logger.info(f"[{session_id}] Cancel requested")
                        await send_system(websocket, "Cancellation not yet implemented")

                elif msg.type == MessageType.PICK_DIR:
                    logger.info(f"[{session_id}] Directory picker requested")
                    path = await pick_directory_async()
                    if path and session:
                        session.agent.state.working_dir = Path(path).resolve()
                        _save_working_dir(path)
                        await send_system(websocket, f"Working directory: {path}")
                    else:
                        await send_system(websocket, "No folder selected")

                elif msg.type == MessageType.LIST_SESSIONS:
                    wdir = data.get("working_dir") or (str(session.agent.state.working_dir) if session else ".")
                    sess_list = list_sessions_from_disk(wdir)
                    await websocket.send(json.dumps({"type": "sessions_list", "sessions": sess_list, "working_dir": wdir}))

                elif msg.type == MessageType.PING:
                    await websocket.send(json.dumps(ServerMessage(type=MessageType.SYSTEM, message="pong").to_json()))

                else:
                    await send_error(websocket, f"Unknown message type: {msg.type}")

            except json.JSONDecodeError:
                await send_error(websocket, "Invalid JSON")
            except ValueError as e:
                await send_error(websocket, str(e))
            except Exception as e:
                logger.exception(f"Error processing message: {e}")
                await send_error(websocket, f"Internal error: {e}")

    except websockets.exceptions.ConnectionClosed:
        logger.info(f"[{session_id}] Client disconnected")
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")


async def send_system(websocket, message: str):
    msg = ServerMessage(type=MessageType.SYSTEM, message=message)
    await websocket.send(json.dumps(msg.to_json()))


async def send_error(websocket, error: str):
    msg = ServerMessage(type=MessageType.ERROR, error=error)
    await websocket.send(json.dumps(msg.to_json()))


def _event_to_server_message(event: dict) -> ServerMessage:
    """Convert an agent event dict to a ServerMessage."""
    event_type = event.get("type")

    if event_type == "thinking":
        return ServerMessage(type=MessageType.THINKING, chunk=event.get("chunk"))
    elif event_type == "tool_call":
        return ServerMessage(type=MessageType.TOOL_CALL, tool_name=event.get("name"), tool_args=event.get("args"))
    elif event_type == "tool_result":
        return ServerMessage(type=MessageType.TOOL_RESULT, tool_name=event.get("name"), result=event.get("result"))
    elif event_type == "response":
        return ServerMessage(type=MessageType.RESPONSE, chunk=event.get("chunk"))
    elif event_type == "system":
        return ServerMessage(type=MessageType.SYSTEM, message=event.get("message"))
    elif event_type == "done":
        return ServerMessage(
            type=MessageType.DONE,
            context_pct=event.get("context_pct"),
            tokens_used=event.get("tokens_used"),
            token_limit=event.get("token_limit"),
        )
    elif event_type == "error":
        return ServerMessage(type=MessageType.ERROR, error=event.get("error"))
    else:
        return ServerMessage(type=MessageType.ERROR, error=f"Unknown event type: {event_type}")


async def main():
    """Start WebSocket server."""
    logger.info(f"Starting server on ws://{HOST}:{PORT}")
    logger.info(f"Model: {MODEL}, Thinking: {THINKING}, WorkingDir: {WORKING_DIR}")

    bind_host = "127.0.0.1" if HOST == "localhost" else HOST

    async with websockets.serve(handle_client, bind_host, PORT):
        logger.info(f"Server listening on {bind_host}:{PORT}")
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
