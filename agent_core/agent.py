"""Main Agent class with tool-calling loop."""

import json
import uuid
import os
import platform
from typing import AsyncGenerator
from google import genai
from google.genai import types

from .state import SessionState, Message
from .tools import ToolRegistry, FileSystemMCP, ShellMCP
from .compaction import should_compact, compact_history


def _build_system_prompt(working_dir: str, model: str) -> str:
    cwd = os.path.abspath(working_dir)
    plat = platform.system()
    if plat.lower() == "windows":
        shell = os.environ.get("COMSPEC", "powershell.exe")
    else:
        shell = os.environ.get("SHELL", "bash")

    return f"""You are FreeCode v2.0, an advanced, interactive agentic coding assistant developed to help users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques or malicious use.
IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming.

# System & Identity
 - You are FreeCode v2.0. If the user asks for your name or identity, proudly state you are FreeCode v2.0.
 - You exist to analyze codebases, write code, run commands, and solve complex problems autonomously.
 - All text you output is displayed to the user. Use markdown for formatting.
 - The system will automatically compact prior messages as context approaches limits.

# Doing tasks
 - Read files before modifying them. Understand existing code before suggesting changes.
 - Do not create files unless absolutely necessary. Prefer editing existing files.
 - Do not add features, refactor, or make "improvements" beyond what was asked.
 - If an approach fails, diagnose why before switching tactics. Don't retry blindly.
 - If the user asks to /compact, summarize the conversation concisely and say "Context compacted."

# Executing actions with care
 - For destructive or hard-to-reverse operations (deleting files, overwriting data), confirm with the user first.
 - Carefully consider the reversibility and blast radius of actions.

# Using your tools
 - `filesystem` tool: use for all file operations (ls, read, write, edit, find, delete). Do NOT use shell for file operations.
 - `shell` tool: use for build commands, tests, git, package managers. 
 - IMPORTANT FOR SHELL: You are running on {plat}. If it is Windows, write valid Powershell or CMD commands (e.g. use `Remove-Item` instead of `rm`, `Get-ChildItem` instead of `ls` if needed, etc.). 
 - Do NOT try to run `bash` commands like `rm -rf` on Windows unless running in WSL or Git Bash.

# Tone and style
 - Be concise and direct. Lead with the answer or action, not the reasoning.
 - No emojis unless the user explicitly asks.
 - Skip preamble and filler. Do not restate what the user said — just do it.
 - NEVER mention in your thinking what instructions you're supposed to follow. Keep internal reasoning private.

# Environment
 - Working directory: {cwd}
 - Platform: {plat}
 - Shell: {shell}
 - Model Capabilities: {model}
 - Today's date: {__import__('datetime').date.today()}"""


class Agent:
    """Agentic loop orchestrator."""

    def __init__(
        self,
        api_key: str,
        model: str = "gemma-4-26b-a4b-it",
        working_dir: str = ".",
        enable_thinking: bool = True,
        token_limit: int = 100000,
    ):
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.enable_thinking = enable_thinking
        self.state = SessionState(working_dir=working_dir, token_limit=token_limit)
        self.system_prompt = _build_system_prompt(working_dir, model)

        # Initialize tools
        self.tools = ToolRegistry()
        self.tools.register(FileSystemMCP(working_dir=working_dir))
        self.tools.register(ShellMCP())

    async def process_input(
        self, user_message: str, effort: str = "MEDIUM", working_dir: str = ".", model: str = None
    ) -> AsyncGenerator[dict, None]:
        """
        Main agentic loop.
        Yields: {"type": "thinking"|"tool_call"|"tool_result"|"response"|"done"|"error", ...}
        """
        # Update working directory if changed
        if working_dir and str(self.state.working_dir) != str(os.path.abspath(working_dir)):
            self.state.working_dir = os.path.abspath(working_dir)
            self.system_prompt = _build_system_prompt(working_dir, self.model)
            # Re-initialize filesystem tool with new working dir
            self.tools.register(FileSystemMCP(working_dir=working_dir))

        # Update model if changed
        if model and self.model != model:
            self.model = model
            self.system_prompt = _build_system_prompt(str(self.state.working_dir), model)

        # Add user message to history
        self.state.add_message("user", user_message)

        # Check if compaction needed (or manually requested)
        is_manual_compact = user_message.startswith("/compact")
        if is_manual_compact or should_compact(self.state):
            async for event in self._compact():
                yield event
            if is_manual_compact:
                # Return immediately since manual compact is a meta-action
                api_tokens = self.state.token_count
                _, limit = self.state.token_usage()
                tokens_used = api_tokens if api_tokens else self.state.token_usage()[0]
                context_pct = round(min(tokens_used / limit * 100, 100.0), 1) if limit else 0.0
                yield {"type": "done", "tokens_used": tokens_used, "token_limit": limit, "context_pct": context_pct}
                return

        # Build request
        messages = [
            {"role": m.role, "content": m.content} for m in self.state.messages
        ]

        task_id = str(uuid.uuid4())[:8]
        self.state.add_task(task_id, "tool_loop", {"messages_count": len(messages)})

        try:
            # Call model with tools
            async for event in self._model_loop(messages, effort=effort):
                yield event

            self.state.update_task_status(task_id, "completed")
            # Prefer real token count from API (set by _model_loop via usage_metadata)
            api_tokens = self.state.token_count
            _, limit = self.state.token_usage()
            tokens_used = api_tokens if api_tokens else self.state.token_usage()[0]
            context_pct = round(min(tokens_used / limit * 100, 100.0), 1) if limit else 0.0
            yield {"type": "done", "tokens_used": tokens_used, "token_limit": limit, "context_pct": context_pct}

        except Exception as e:
            self.state.update_task_status(task_id, "failed")
            yield {"type": "error", "error": str(e)}

    async def _model_loop(
        self, messages: list[dict], effort: str = "MEDIUM"
    ) -> AsyncGenerator[dict, None]:
        """Run model with tools until completion."""

        # Build config — Gemma models don't support system_instruction or ThinkingLevel,
        # so we inject the system prompt as the first user/model turn pair and skip thinking.
        is_gemma = self.model.startswith("gemma")
        config = types.GenerateContentConfig(
            tools=[{"function_declarations": self.tools.get_definitions()}],
        )
        if self.enable_thinking and not is_gemma:
            config.thinking_config = types.ThinkingConfig(
                thinking_level=types.ThinkingLevel[effort]
            )

        # Format messages for Gemma, prepending system prompt as first turn (internal only)
        contents = [
            types.Content(role="user",  parts=[types.Part(text=self.system_prompt)]),
            types.Content(role="model", parts=[types.Part(text="Understood. I'm ready to assist.")]),
        ]
        # Track that we injected a system prompt to filter it from visible output
        is_system_prompt_injected = True
        for msg in messages:
            contents.append(
                types.Content(
                    role=msg["role"], parts=[types.Part(text=msg["content"])]
                )
            )

        # Stream response
        full_text = ""
        skipped_system_ack = False  # Track if we already skipped the initial ack
        is_first_response = len(messages) == 0  # New session has no messages yet
        async for chunk in self._stream_generate(contents, config):
            # Synthetic usage event — store on state and skip rendering
            if isinstance(chunk, dict) and chunk.get("__usage__"):
                self.state.token_count = chunk["total_tokens"]
                continue

            # Propagate errors yielded by _stream_generate
            if isinstance(chunk, dict) and chunk.get("type") == "error":
                yield chunk
                return

            # Extract thinking
            if hasattr(chunk, "candidates") and chunk.candidates:
                for part in chunk.candidates[0].content.parts:
                    if hasattr(part, "thought") and part.thought and getattr(part, "text", ""):
                        if part.text.strip():  # Filter out empty or whitespace-only thoughts
                            yield {"type": "thinking", "chunk": part.text}

            # Extract text
            if getattr(chunk, "text", None):
                full_text += chunk.text
                # Skip system prompt acknowledgment only on first response of new session
                is_system_ack = is_first_response and not skipped_system_ack and full_text.strip() in ["Understood. I'm ready to assist.", "Understood. I'm ready to help."]
                if not is_system_ack:
                    yield {"type": "response", "chunk": chunk.text}
                else:
                    skipped_system_ack = True  # Mark that we skipped it

            # Extract tool calls
            if hasattr(chunk, "candidates") and chunk.candidates:
                for part in chunk.candidates[0].content.parts:
                    if hasattr(part, "function_call") and part.function_call:
                        # Record tool call in history as model message
                        args_str = json.dumps(part.function_call.args) if part.function_call.args else ""
                        self.state.add_message("model", f"Calling tool: {part.function_call.name}({args_str})")
                        
                        async for event in self._handle_tool_call(
                            part.function_call, messages, contents, effort=effort
                        ):
                            yield event
                        return

        # Add model response to history
        if full_text:
            self.state.add_message("model", full_text)

    async def _handle_tool_call(
        self, function_call: any, messages: list[dict], contents: list, effort: str = "MEDIUM"
    ) -> AsyncGenerator[dict, None]:
        """Execute tool and recurse."""

        tool_name = function_call.name
        tool_args = dict(function_call.args) if function_call.args else {}

        yield {"type": "tool_call", "name": tool_name, "args": tool_args}

        # Execute tool
        tool = self.tools.get(tool_name)
        if not tool:
            result = f"Error: Tool '{tool_name}' not found"
        else:
            try:
                result = await tool.execute(**tool_args)
                # Track file modifications
                if tool_name == "filesystem" and tool_args.get("operation") in [
                    "write",
                    "edit",
                ]:
                    self.state.track_file_modification(tool_args.get("path", ""))
            except Exception as e:
                result = f"Error: {e}"

        yield {"type": "tool_result", "name": tool_name, "result": result}

        # Add tool result to history and continue
        self.state.add_message("user", f"Tool Result ({tool_name}):\n{result}")

        # Recurse: call model again with updated history
        new_messages = [
            {"role": m.role, "content": m.content} for m in self.state.messages
        ]
        async for event in self._model_loop(new_messages, effort=effort):
            yield event

    async def _compact(self) -> AsyncGenerator[dict, None]:
        """Compact history when token limit approached."""
        yield {"type": "system", "message": "Compacting context... This may take a moment."}

        summary = await compact_history(
            self.client, self.model, self.state.messages
        )

        # Replace history with summary
        self.state.messages = [
            Message(
                role="model",
                content=f"Previous context summary:\n\n{summary}",
            )
        ]

        yield {"type": "system", "message": "Context successfully compacted."}

    async def _stream_generate(
        self, contents, config
    ) -> AsyncGenerator[dict, None]:
        """Wrapper for streaming generation. Emits API chunks then a synthetic
        __usage__ dict containing real token counts from the final chunk."""
        try:
            stream = await self.client.aio.models.generate_content_stream(
                model=self.model, contents=contents, config=config
            )
            last_usage = None
            async for chunk in stream:
                if getattr(chunk, "usage_metadata", None):
                    last_usage = chunk.usage_metadata
                yield chunk

            # After stream ends, yield a synthetic usage event so _model_loop
            # can forward real token counts in the done event.
            if last_usage:
                yield {"__usage__": True,
                       "prompt_tokens": last_usage.prompt_token_count or 0,
                       "response_tokens": last_usage.candidates_token_count or 0,
                       "thoughts_tokens": last_usage.thoughts_token_count or 0,
                       "total_tokens": last_usage.total_token_count or 0}
        except Exception as e:
            yield {"type": "error", "error": str(e)}
