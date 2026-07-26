-- Add combined_prompt to evaluations (non-destructive).
--
-- Run against backend/storage/data.db (SQLite).

ALTER TABLE evaluations ADD COLUMN combined_prompt TEXT;
