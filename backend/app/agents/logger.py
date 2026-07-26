from typing import Annotated, Literal, Union

from ollama import chat
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from app.agent_tools.logger import Item, log_transaction
from app.core.config import settings

with open(settings.logger_system_prompt_path, "r") as file:
    system_prompt = file.read()

MODEL = settings.logger_model


class LogTransaction(BaseModel):
    action: Literal["log_transaction"]
    amount: float
    currency: str = "INR"
    status: Literal["pending", "completed", "failed", "refunded"] = "completed"
    transaction_type: Literal["expense", "income", "transfer", "refund"] = "expense"
    payment_method: Literal["cash", "card", "upi"] | None = None
    beneficiary: str | None = None
    merchant: str | None = None
    category: str | None = None
    sub_category: str | None = None
    items: list[Item] | None = None


class AskClarification(BaseModel):
    action: Literal["ask_clarification"]
    clarification_request: str


class UnsupportedRequest(BaseModel):
    action: Literal["unsupported_request"]
    reason: str


AgentOutput = Annotated[
    Union[LogTransaction, AskClarification, UnsupportedRequest],
    Field(discriminator="action"),
]

agent_output_adapter = TypeAdapter(AgentOutput)
OUTPUT_SCHEMA = agent_output_adapter.json_schema()


def handle_agent_output(
    output: LogTransaction | AskClarification | UnsupportedRequest,
) -> int | None:
    if isinstance(output, LogTransaction):
        return log_transaction(**output.model_dump(exclude={"action"}))
    return None


def run_logger_agent(messages: list[dict]):
    """Run the logger agent and persist a transaction when action is log_transaction."""
    messages = [{"role": "system", "content": system_prompt}] + messages
    response = chat(
        model=MODEL,
        messages=messages,
        format=OUTPUT_SCHEMA,
        think=False,
        options={"temperature": settings.logger_temperature},
    )

    agent_response_raw = response.message.model_dump_json()
    agent_response_content = response.message.content

    try:
        parsed = agent_output_adapter.validate_json(agent_response_content or "")
    except ValidationError:
        return {
            "agent_response_raw": agent_response_raw,
            "agent_response_content": agent_response_content,
            "transaction_id": None,
        }

    return {
        "agent_response_raw": agent_response_raw,
        "agent_response_content": parsed.model_dump_json(),
        "transaction_id": handle_agent_output(parsed),
    }
