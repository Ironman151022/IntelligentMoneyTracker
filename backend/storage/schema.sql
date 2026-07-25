-- Intelligent Money Tracker — schema from docs/knowledge_graph.md
-- Run this file in DBeaver against backend/storage/data.db (SQLite).
-- Enable FK enforcement for this connection if it is not already on.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Nodes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_methods (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS merchants (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beneficiaries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    relationship TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    amount            INTEGER NOT NULL CHECK (amount >= 0),
    currency          TEXT NOT NULL DEFAULT 'INR',
    type              TEXT NOT NULL DEFAULT 'expense'
                          CHECK (type IN ('expense', 'income', 'transfer', 'refund')),
    status            TEXT NOT NULL DEFAULT 'completed'
                          CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT,
    payment_method_id INTEGER REFERENCES payment_methods (id) ON DELETE SET NULL,
    merchant_id       INTEGER REFERENCES merchants (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    line_amount    INTEGER CHECK (line_amount IS NULL OR line_amount >= 0),
    quantity       INTEGER CHECK (quantity IS NULL OR quantity > 0)
);

-- ---------------------------------------------------------------------------
-- Relationship / lookup tables (graph edges)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS transaction_categories (
    transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    category_id    INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, category_id)
);

CREATE TABLE IF NOT EXISTS transaction_beneficiaries (
    transaction_id   INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    beneficiary_id   INTEGER NOT NULL REFERENCES beneficiaries (id) ON DELETE CASCADE,
    allocated_amount INTEGER CHECK (allocated_amount IS NULL OR allocated_amount >= 0),
    PRIMARY KEY (transaction_id, beneficiary_id)
);

CREATE TABLE IF NOT EXISTS merchant_aliases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id INTEGER NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    name        TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indexes for common lookups
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_categories_parent
    ON categories (parent_id);

CREATE INDEX IF NOT EXISTS idx_transactions_type
    ON transactions (type);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
    ON transactions (payment_method_id);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant
    ON transactions (merchant_id);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions (created_at);

CREATE INDEX IF NOT EXISTS idx_items_transaction
    ON items (transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_categories_category
    ON transaction_categories (category_id);

CREATE INDEX IF NOT EXISTS idx_transaction_beneficiaries_beneficiary
    ON transaction_beneficiaries (beneficiary_id);

CREATE INDEX IF NOT EXISTS idx_merchant_aliases_merchant
    ON merchant_aliases (merchant_id);

-- ---------------------------------------------------------------------------
-- Agent evaluation / chat turns (not graph nodes)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evaluations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    user_prompt     TEXT NOT NULL,
    agent_response  TEXT,
    tool_name       TEXT,
    tool_args_json  TEXT,
    tool_result     TEXT,
    transaction_id  INTEGER REFERENCES transactions (id) ON DELETE SET NULL,
    verdict         TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verdict IN ('pending', 'ok', 'not_ok')),
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_evaluations_chat_id
    ON evaluations (chat_id);
