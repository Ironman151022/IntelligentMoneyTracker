import sqlite3
from pathlib import Path

from app.core.config import settings

DB_PATH = Path(settings.database_path)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows as dict-like objects
    conn.execute("PRAGMA foreign_keys = ON")  # required — schema comment says so
    return conn
