-- Migration: Add UNIQUE constraint to file_hash
-- Description: Ensures no two submissions have identical content. 
-- Also cleans up existing duplicates before applying the constraint.

-- 1. Identify and delete duplicates (keeping the oldest entry per hash)
DELETE FROM submissions a
USING submissions b
WHERE a.id > b.id 
  AND a.file_hash = b.file_hash;

-- 2. Add the UNIQUE constraint
ALTER TABLE submissions
ADD CONSTRAINT unique_file_hash UNIQUE (file_hash);

-- 3. Add an index for faster lookups if it doesn't exist (though UNIQUE creates one)
CREATE INDEX IF NOT EXISTS idx_submissions_file_hash_unique ON submissions(file_hash);
