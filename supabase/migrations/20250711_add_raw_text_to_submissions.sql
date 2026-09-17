ALTER TABLE submissions ADD COLUMN IF NOT EXISTS raw_text TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_raw_text ON submissions USING gin(to_tsvector('english', coalesce(raw_text, '')));
