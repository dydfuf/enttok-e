import asyncio
import uuid
from typing import Dict, List, TypedDict

from app.core.config import SESSION_MAX_CHARS, SESSION_MAX_MESSAGES


class SessionMessage(TypedDict):
    role: str
    content: str


session_lock = asyncio.Lock()
sessions: Dict[str, List[SessionMessage]] = {}


async def create_session() -> str:
    session_id = f"session_{uuid.uuid4().hex}"
    async with session_lock:
        sessions[session_id] = []
    return session_id


async def get_session_messages(session_id: str) -> List[SessionMessage]:
    async with session_lock:
        return list(sessions.get(session_id, []))


async def append_session_message(
    session_id: str, role: str, content: str
) -> None:
    if not content.strip():
        return
    async with session_lock:
        messages = sessions.setdefault(session_id, [])
        messages.append({"role": role, "content": content})
        while len(messages) > SESSION_MAX_MESSAGES:
            messages.pop(0)
        total_chars = sum(len(msg["content"]) for msg in messages)
        while total_chars > SESSION_MAX_CHARS and messages:
            removed = messages.pop(0)
            total_chars -= len(removed["content"])


def format_session_prompt(history: List[SessionMessage], prompt: str) -> str:
    transcript: List[str] = []
    for message in history:
        role_label = "User" if message["role"] == "user" else "Assistant"
        transcript.append(f"{role_label}: {message['content']}")
    transcript.append(f"User: {prompt}")
    return "\n\n".join(transcript)

