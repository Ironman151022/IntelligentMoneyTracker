from typing import Annotated, Literal, Union

from ollama import chat
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from app.agent_tools.logger import Item, log_transaction
from app.core.config import settings
from app.services.meal_slot import enrich_food_meal_slot

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
) -> tuple[LogTransaction | AskClarification | UnsupportedRequest, int | None]:
    """Persist when logging; return (possibly enriched output, transaction_id)."""
    if isinstance(output, LogTransaction):
        enriched = output.model_copy(
            update={
                "sub_category": enrich_food_meal_slot(
                    output.category,
                    output.sub_category,
                )
            }
        )
        return enriched, log_transaction(**enriched.model_dump(exclude={"action"}))
    return output, None


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

    enriched, transaction_id = handle_agent_output(parsed)
    return {
        "agent_response_raw": agent_response_raw,
        "agent_response_content": (
            enriched.model_dump_json()
            if isinstance(enriched, LogTransaction)
            else parsed.model_dump_json()
        ),
        "transaction_id": transaction_id,
    }
