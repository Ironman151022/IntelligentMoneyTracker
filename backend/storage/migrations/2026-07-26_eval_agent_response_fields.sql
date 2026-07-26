-- Drop evaluations and recreate with structured-response columns.
-- Existing evaluation rows are discarded intentionally.
--
-- Run against backend/storage/data.db (SQLite).

PRAGMA foreign_keys = OFF;

BEGIN;

DROP TABLE IF EXISTS evaluations;

CREATE TABLE evaluations (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id                 TEXT NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    user_prompt             TEXT NOT NULL,
    agent_response_raw      TEXT,
    agent_response_content  TEXT,
    transaction_id          INTEGER REFERENCES transactions (id) ON DELETE SET NULL,
    verdict                 TEXT NOT NULL DEFAULT 'pending'
                                CHECK (verdict IN ('pending', 'ok', 'not_ok')),
    notes                   TEXT
);

CREATE INDEX IF NOT EXISTS idx_evaluations_chat_id
    ON evaluations (chat_id);

COMMIT;

PRAGMA foreign_keys = ON;
