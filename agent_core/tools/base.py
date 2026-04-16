"""Base tool class and registry."""

from abc import ABC, abstractmethod
from typing import Any, Callable
from dataclasses import dataclass


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict  # JSON schema


class BaseTool(ABC):
    """Base class for all tools."""

    @property
    @abstractmethod
    def definition(self) -> ToolDefinition:
        """Return tool definition for model."""
        pass

    @abstractmethod
    async def execute(self, **kwargs) -> str:
        """Execute tool and return result."""
        pass


class ToolRegistry:
    """Manages available tools."""

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool):
        """Register a tool by name."""
        self._tools[tool.definition.name] = tool

    def get(self, name: str) -> BaseTool | None:
        """Get tool by name."""
        return self._tools.get(name)

    def get_all(self) -> dict[str, BaseTool]:
        """Get all registered tools."""
        return self._tools.copy()

    def get_definitions(self) -> list[dict]:
        """Get tool definitions for API (Gemma format)."""
        return [
            {
                "name": tool.definition.name,
                "description": tool.definition.description,
                "parameters": tool.definition.parameters,
            }
            for tool in self._tools.values()
        ]
