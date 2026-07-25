from typing import Literal
from pydantic import BaseModel

from app.services.database import get_connection


class Item(BaseModel):
    name: str
    quantity: int | None = None
    line_amount: float | None = None


class CreateTransaction(BaseModel):
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


def _to_db_amount(value: float | None) -> int | None:
    """Store money as non-negative integer major units (e.g. rupees)."""
    if value is None:
        return None
    return int(round(value))


def _get_or_create_payment_method(conn, method: str) -> int:
    row = conn.execute(
        """
        INSERT INTO payment_methods (method) VALUES (?)
        ON CONFLICT(method) DO UPDATE SET method = excluded.method
        RETURNING id
        """,
        (method,),
    ).fetchone()
    return row["id"]


def _get_or_create_merchant(conn, name: str) -> int:
    row = conn.execute(
        "SELECT id FROM merchants WHERE name = ?",
        (name,),
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO merchants (name) VALUES (?)", (name,))
    return cur.lastrowid


def _get_or_create_beneficiary(conn, name: str) -> int:
    row = conn.execute(
        """
        INSERT INTO beneficiaries (name) VALUES (?)
        ON CONFLICT(name) DO UPDATE SET name = excluded.name
        RETURNING id
        """,
        (name,),
    ).fetchone()
    return row["id"]


def _get_or_create_category(conn, name: str, parent_id: int | None = None) -> int:
    if parent_id is None:
        row = conn.execute(
            """
            SELECT id FROM categories
            WHERE name = ? AND parent_id IS NULL
            """,
            (name,),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT id FROM categories
            WHERE name = ? AND parent_id = ?
            """,
            (name, parent_id),
        ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO categories (name, parent_id) VALUES (?, ?)",
        (name, parent_id),
    )
    return cur.lastrowid


def log_transaction(
    amount: float,
    currency: str = "INR",
    status: Literal["pending", "completed", "failed", "refunded"] = "completed",
    transaction_type: Literal["expense", "income", "transfer", "refund"] = "expense",
    payment_method: Literal["cash", "card", "upi"] | None = None,
    beneficiary: str | None = None,
    merchant: str | None = None,
    category: str | None = None,
    sub_category: str | None = None,
    items: list[Item] | None = None,
):
    """Log one Transaction node and its linked entities from extracted fields."""
    transaction = CreateTransaction(
        amount=amount,
        currency=currency,
        status=status,
        transaction_type=transaction_type,
        payment_method=payment_method,
        beneficiary=beneficiary,
        merchant=merchant,
        category=category,
        sub_category=sub_category,
        items=items,
    )

    conn = get_connection()
    try:
        with conn:  # one commit for all statements; rollback on error
            payment_method_id = (
                _get_or_create_payment_method(conn, transaction.payment_method)
                if transaction.payment_method
                else None
            )
            merchant_id = (
                _get_or_create_merchant(conn, transaction.merchant)
                if transaction.merchant
                else None
            )

            cur = conn.execute(
                """
                INSERT INTO transactions (
                    amount, currency, type, status, payment_method_id, merchant_id
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    _to_db_amount(transaction.amount),
                    transaction.currency,
                    transaction.transaction_type,
                    transaction.status,
                    payment_method_id,
                    merchant_id,
                ),
            )
            transaction_id = cur.lastrowid

            if transaction.beneficiary:
                beneficiary_id = _get_or_create_beneficiary(conn, transaction.beneficiary)
                conn.execute(
                    """
                    INSERT INTO transaction_beneficiaries (transaction_id, beneficiary_id)
                    VALUES (?, ?)
                    """,
                    (transaction_id, beneficiary_id),
                )

            category_ids: list[int] = []
            parent_id = None
            if transaction.category:
                parent_id = _get_or_create_category(conn, transaction.category)
                category_ids.append(parent_id)
            if transaction.sub_category:
                child_id = _get_or_create_category(
                    conn, transaction.sub_category, parent_id=parent_id
                )
                category_ids.append(child_id)
            for category_id in category_ids:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id)
                    VALUES (?, ?)
                    """,
                    (transaction_id, category_id),
                )

            if transaction.items:
                conn.executemany(
                    """
                    INSERT INTO items (name, transaction_id, line_amount, quantity)
                    VALUES (?, ?, ?, ?)
                    """,
                    [
                        (
                            item.name,
                            transaction_id,
                            _to_db_amount(item.line_amount),
                            item.quantity,
                        )
                        for item in transaction.items
                    ],
                )
    finally:
        conn.close()

    return transaction_id


def ask_clarification(clarification_request: str):
    """Ask the user one short clarifying question when a required field is missing."""
    return clarification_request


def unsupported_request(reason: str):
    """Explain that the request is outside Version 1 logging support."""
    return reason
