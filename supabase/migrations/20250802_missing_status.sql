-- Migration: Use 'missing' as the canonical no-submission status
-- Purpose: Rename 'non-compliant' -> 'missing' for clarity (no submission at all).
--          Canonical set becomes ('compliant', 'late', 'missing').
--          Compliant = submitted on or before deadline, Late = submitted after
--          deadline, Missing = no submission.

BEGIN;

-- 1. Drop any existing constraint
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_compliance_status_check;

-- 2. Reconcile legacy values to the new canonical set
UPDATE submissions SET compliance_status = 'missing' WHERE compliance_status = 'non-compliant';

-- 3. Add the canonical constraint
ALTER TABLE submissions ADD CONSTRAINT submissions_compliance_status_check
  CHECK (compliance_status IN ('compliant', 'late', 'missing'));

-- 4. Ensure default value matches the canonical set
ALTER TABLE submissions ALTER COLUMN compliance_status SET DEFAULT 'compliant';

COMMIT;
