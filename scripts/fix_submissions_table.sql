-- ═══════════════════════════════════════════════════════════════
-- Migration: Fix submissions table schema
-- Purpose: Remove conflicting 'status' column and align with
--          compliance_status column added in previous migration
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Drop the old 'status' column if it exists
ALTER TABLE submissions 
DROP COLUMN IF EXISTS status;

-- Step 2: Ensure teaching_load_id column exists
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS teaching_load_id UUID REFERENCES teaching_loads(id) ON DELETE SET NULL;

-- Step 3: Ensure compliance_status column exists with correct constraints
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'compliant';

-- Step 4: Add check constraint for compliance_status if not already present
ALTER TABLE submissions 
DROP CONSTRAINT IF EXISTS submissions_compliance_status_check;

ALTER TABLE submissions 
ADD CONSTRAINT submissions_compliance_status_check 
CHECK (compliance_status IN ('compliant', 'late', 'missing'));

-- Step 5: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_submissions_teaching_load 
ON submissions(teaching_load_id);

CREATE INDEX IF NOT EXISTS idx_submissions_compliance_status 
ON submissions(compliance_status);

CREATE INDEX IF NOT EXISTS idx_submissions_user_teaching_load 
ON submissions(user_id, teaching_load_id);

-- Step 6: Verify the schema
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'submissions'
-- ORDER BY ordinal_position;
