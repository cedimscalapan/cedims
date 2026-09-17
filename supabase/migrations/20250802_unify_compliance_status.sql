-- Migration: Unify compliance_status constraint across all schemas
-- Purpose: Resolve the conflict between seed_full.sql ('compliant','late','non-compliant')
--          and scripts/fix_submissions_table.sql + add_teaching_load_compliance.sql
--          which create the OLD constraint ('on-time','late','missing').
--          Canonical set: ('compliant', 'late', 'missing').
--          Compliant = on/before deadline, Late = after deadline, Missing = no submission.

BEGIN;

-- 1. Drop any existing constraint (canonical name or otherwise)
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_compliance_status_check;

-- 2. Reconcile legacy data values
UPDATE submissions SET compliance_status = 'compliant' WHERE compliance_status = 'on-time';
UPDATE submissions SET compliance_status = 'missing' WHERE compliance_status = 'non-compliant';

-- 3. Add the canonical constraint
ALTER TABLE submissions ADD CONSTRAINT submissions_compliance_status_check
  CHECK (compliance_status IN ('compliant', 'late', 'missing'));

-- 4. Ensure default value matches the canonical set
ALTER TABLE submissions ALTER COLUMN compliance_status SET DEFAULT 'compliant';

COMMIT;
