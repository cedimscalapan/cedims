-- Allow teachers to resubmit the same PDF content without blocking the upload.
-- Keep a normal index on file_hash so verification and lookups stay fast.

ALTER TABLE submissions
DROP CONSTRAINT IF EXISTS unique_file_hash;

DROP INDEX IF EXISTS idx_submissions_file_hash_unique;

CREATE INDEX IF NOT EXISTS idx_submissions_file_hash
ON submissions(file_hash);
