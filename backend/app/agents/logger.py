import json
import re

from ollama import chat

from app.agent_tools.logger import ask_clarification, log_transaction, unsupported_request
from app.core.config import settings

with open(settings.logger_system_prompt_path, "r") as file:
    system_prompt = file.read()

MODEL = settings.logger_model
AGENT_TOOLS = [log_transaction, ask_clarification, unsupported_request]
TOOL_DISPATCH = {
    "log_transaction": log_transaction,
    "ask_clarification": ask_clarification,
    "unsupported_request": unsupported_request,
}

_TOOL_NAMES = tuple(TOOL_DISPATCH.keys())


def _extract_named_string(body: str, key: str) -> str | None:
    patterns = [
        rf'{key}\s*=\s*"((?:[^"\\]|\\.)*)"',
        rf"{key}\s*=\s*'((?:[^'\\]|\\.)*)'",
        rf'{key}\s*:\s*<\|"\|>(.*?)<\|"\|>',
        rf'{key}\s*:\s*"((?:[^"\\]|\\.)*)"',
        rf"{key}\s*:\s*'((?:[^'\\]|\\.)*)'",
    ]
    for pattern in patterns:
        match = re.search(pattern, body, re.DOTALL)
        if match:
            return match.group(1)
    return None


def _parse_text_tool_call(content: str) -> tuple[str, dict] | None:
    """Fallback when the model writes a tool call as plain text instead of tool_calls."""
    if not content:
        return None

    content = content.strip()
    match = re.match(
        rf"^({'|'.join(_TOOL_NAMES)})\s*[(\{{](.*)[)\}}]\s*$",
        content,
        re.DOTALL,
    )
    if not match:
        return None

    tool_name, body = match.group(1), match.group(2).strip()

    if tool_name == "unsupported_request":
        reason = _extract_named_string(body, "reason")
        if reason is not None:
            return tool_name, {"reason": reason}

    if tool_name == "ask_clarification":
        clarification = _extract_named_string(body, "clarification_request")
        if clarification is not None:
            return tool_name, {"clarification_request": clarification}

    if tool_name == "log_transaction":
        # Prefer JSON-looking payloads if the model emitted them as text.
        try:
            return tool_name, json.loads(body)
        except json.JSONDecodeError:
            return None

    return None


def run_logger_agent(messages: list[dict]):
    """Run the logger agent on one user utterance and execute the tool it chooses."""
    messages = [{"role": "system", "content": system_prompt}] + messages
    response = chat(
        model=MODEL,
        messages=messages,
        tools=AGENT_TOOLS,
        think=False,
        options={"temperature": settings.logger_temperature},
    )

    agent_response = response.message.model_dump_json()
    tool_name = None
    tool_args = None

    if response.message.tool_calls:
        tool_call = response.message.tool_calls[0]
        tool_name = tool_call.function.name
        tool_args = tool_call.function.arguments
        if isinstance(tool_args, str):
            tool_args = json.loads(tool_args)
    # else:
    #     parsed = _parse_text_tool_call(response.message.content or "")
    #     if parsed:
    #         tool_name, tool_args = parsed

    if not tool_name:
        return {
            "agent_response": agent_response,
            "tool_name": None,
            "tool_args": None,
            "tool_result": None,
            "tool_call": False,
        }

    handler = TOOL_DISPATCH.get(tool_name)
    if handler is None:
        return {
            "agent_response": agent_response,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "tool_result": f"Unknown tool: {tool_name}",
            "tool_call": True,
        }

    tool_result = handler(**tool_args)

    return {
        "agent_response": agent_response,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "tool_result": tool_result,
        "tool_call": True,
    }
