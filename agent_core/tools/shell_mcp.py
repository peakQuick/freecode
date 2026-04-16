"""Shell execution tool."""

import subprocess
import asyncio
from .base import BaseTool, ToolDefinition


class ShellMCP(BaseTool):
    """Execute shell commands."""

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="shell",
            description="Execute shell commands",
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Command to execute"}
                },
                "required": ["command"],
            },
        )

    async def execute(self, **kwargs) -> str:
        command = kwargs.get("command", "")
        if not command:
            return "Error: command is required"

        try:
            result = await asyncio.to_thread(
                subprocess.run,
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30,
            )

            output = []
            if result.stdout:
                output.append(f"Stdout:\n{result.stdout}")
            if result.stderr:
                output.append(f"Stderr:\n{result.stderr}")

            return "\n".join(output) if output else "Command executed (no output)"
        except subprocess.TimeoutExpired:
            return "Error: Command timed out (30s)"
        except Exception as e:
            return f"Error: {e}"
