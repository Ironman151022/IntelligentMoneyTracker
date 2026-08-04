"""Infer meal-of-day slot from capture time (IST)."""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# Inclusive start, exclusive end within a local day — late_night wraps midnight.
_MEAL_WINDOWS: list[tuple[str, time, time]] = [
    ("tiffin", time(5, 0), time(10, 30)),
    ("brunch", time(10, 30), time(12, 0)),
    ("lunch", time(12, 0), time(15, 30)),
    ("evening", time(15, 30), time(19, 0)),
    ("dinner", time(19, 0), time(23, 0)),
]


def meal_slot_from_datetime(when: datetime | None = None) -> str:
    """Map local IST clock time → tiffin | brunch | lunch | evening | dinner | late_night."""
    local = (when or datetime.now(tz=IST)).astimezone(IST)
    clock = local.time()
    for name, start, end in _MEAL_WINDOWS:
        if start <= clock < end:
            return name
    return "late_night"


def enrich_food_meal_slot(
    category: str | None,
    sub_category: str | None,
    *,
    when: datetime | None = None,
) -> str | None:
    """
    Keep an explicit sub_category from the model/user.
    If category is food and sub_category is empty, fill meal slot from time.
    """
    if sub_category:
        return sub_category
    if category != "food":
        return None
    return meal_slot_from_datetime(when)
