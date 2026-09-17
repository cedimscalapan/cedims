-- Migration: Allow 'supplementary' compliance_status
-- Purpose: A teacher can upload ANOTHER DLL for an already-covered
--          teaching load + week + doc_type. Such files are stored with
--          compliance_status = 'supplementary' so they are archived but do
--          NOT affect compliant, late, missing, or the compliance rate.
--          Canonical set: ('compliant', 'late', 'missing', 'supplementary').

BEGIN;

-- 1. Drop the existing canonical constraint (if present)
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_compliance_status_check;

-- 2. Reconcile any legacy extra values (defensive; should not exist)
UPDATE submissions
SET compliance_status = 'missing'
WHERE compliance_status IN ('non-compliant');

-- 3. Re-add the constraint including 'supplementary'
ALTER TABLE submissions ADD CONSTRAINT submissions_compliance_status_check
  CHECK (compliance_status IN ('compliant', 'late', 'missing', 'supplementary'));

COMMIT;
