"""Context compaction logic."""

from google import genai
from google.genai import types
from .state import Message

COMPACTION_PROMPT = """Your task is to create a detailed summary of the conversation so far, paying close attention to:
1. User's explicit requests and intents
2. Key technical decisions and concepts
3. Code patterns, file names, and snippets
4. Errors encountered and fixes applied
5. Current working directory and project state

Provide a concise but thorough summary that preserves all essential context for continuing development without losing track.

Wrap your final response in <summary></summary> tags."""


def should_compact(state) -> bool:
    """Check if compaction is needed."""
    return state.should_compact()


async def compact_history(
    client: genai.Client, model: str, messages: list[Message]
) -> str:
    """Summarize conversation history using the model."""
    

    # Build compaction request
    history_text = "\n\n".join(
        [f"{m.role.upper()}:\n{m.content}" for m in messages[-20:]]  # Last 20 messages
    )

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=f"{COMPACTION_PROMPT}\n\nConversation to summarize:\n\n{history_text}"
                )
            ],
        )
    ]

    result = await client.aio.models.generate_content(model=model, contents=contents)

    # Extract summary from tags
    text = result.text
    if "<summary>" in text and "</summary>" in text:
        summary = text.split("<summary>")[1].split("</summary>")[0].strip()
    else:
        summary = text

    return summary
