"""Filesystem tools (MCP-like interface)."""

import os
import asyncio
from pathlib import Path
from typing import Optional
from .base import BaseTool, ToolDefinition


class FileSystemMCP(BaseTool):
    """Filesystem operations: ls, read, write, edit, find."""

    def __init__(self, working_dir: str = "."):
        self.working_dir = Path(working_dir).resolve()

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="filesystem",
            description="Filesystem operations (ls, read, write, edit, find)",
            parameters={
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["ls", "read", "write", "edit", "find"],
                        "description": "Operation to perform",
                    },
                    "path": {"type": "string", "description": "File or directory path"},
                    "content": {"type": "string", "description": "Content (for write)"},
                    "old_string": {
                        "type": "string",
                        "description": "String to replace (for edit)",
                    },
                    "new_string": {
                        "type": "string",
                        "description": "Replacement string (for edit)",
                    },
                    "pattern": {"type": "string", "description": "Glob pattern (for find)"},
                },
                "required": ["operation", "path"],
            },
        )

    async def execute(self, **kwargs) -> str:
        operation = kwargs.get("operation", "").lower()

        try:
            if operation == "ls":
                return await self._ls(kwargs.get("path", "."))
            elif operation == "read":
                return await self._read(kwargs.get("path"))
            elif operation == "write":
                return await self._write(kwargs.get("path"), kwargs.get("content", ""))
            elif operation == "edit":
                return await self._edit(
                    kwargs.get("path"),
                    kwargs.get("old_string", ""),
                    kwargs.get("new_string", ""),
                )
            elif operation == "find":
                return await self._find(kwargs.get("path", "."), kwargs.get("pattern", "*"))
            else:
                return f"Error: Unknown operation '{operation}'"
        except Exception as e:
            return f"Error: {e}"

    async def _ls(self, path: str) -> str:
        """List directory contents."""
        p = self._resolve_path(path)
        if not p.exists():
            return f"Error: Path does not exist: {p}"
        if not p.is_dir():
            return f"Error: Not a directory: {p}"

        items = sorted(os.listdir(p))
        return "\n".join(items) if items else "(empty directory)"

    async def _read(self, path: str) -> str:
        """Read file with line numbers."""
        p = self._resolve_path(path)
        if not p.exists():
            return f"Error: File not found: {p}"
        if not p.is_file():
            return f"Error: Not a file: {p}"

        try:
            with open(p, "r", encoding="utf-8") as f:
                lines = f.readlines()
            return "".join([f"{i+1:4} | {line}" for i, line in enumerate(lines)])
        except UnicodeDecodeError:
            return f"Error: Cannot read binary file: {p}"

    async def _write(self, path: str, content: str) -> str:
        """Write file (creates parent dirs)."""
        p = self._resolve_path(path)
        p.parent.mkdir(parents=True, exist_ok=True)

        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote {len(content)} chars to {p}"

    async def _edit(self, path: str, old_string: str, new_string: str) -> str:
        """Replace exact string in file."""
        p = self._resolve_path(path)
        if not p.exists():
            return f"Error: File not found: {p}"

        with open(p, "r", encoding="utf-8") as f:
            content = f.read()

        if old_string not in content:
            return f"Error: old_string not found in file"
        if content.count(old_string) > 1:
            return f"Error: old_string is not unique (found {content.count(old_string)} matches)"

        new_content = content.replace(old_string, new_string)
        with open(p, "w", encoding="utf-8") as f:
            f.write(new_content)
        return f"Successfully edited {p}"

    async def _find(self, path: str, pattern: str) -> str:
        """Recursively find files matching glob pattern."""
        p = self._resolve_path(path)
        if not p.exists():
            return f"Error: Path not found: {p}"

        results = []
        for match in p.rglob(pattern):
            results.append(str(match.relative_to(self.working_dir)))

        return "\n".join(sorted(results)) if results else "(no matches)"

    def _resolve_path(self, path: str) -> Path:
        """Resolve path relative to working dir, with safety checks."""
        p = Path(path).resolve() if Path(path).is_absolute() else (self.working_dir / path).resolve()

        # Prevent escape from working dir
        try:
            p.relative_to(self.working_dir)
        except ValueError:
            # If outside working dir, just use it anyway (for now, future: restrict)
            pass

        return p
