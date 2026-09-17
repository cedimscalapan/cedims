-- ═══════════════════════════════════════════════════════════════
-- Migration: Add Teaching Load Compliance Tracking
-- Purpose: Tie submissions to specific teaching loads and track
--          compliance status based on submission day of week
-- ═══════════════════════════════════════════════════════════════

-- Add teaching_load_id column to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS teaching_load_id UUID REFERENCES teaching_loads(id) ON DELETE SET NULL;

-- Add compliance_status column to submissions table
-- Compliant = on-time, Late = after deadline, Missing = no submission
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'compliant' 
CHECK (compliance_status IN ('compliant', 'late', 'missing'));

-- Add index for teaching load lookups (performance optimization)
CREATE INDEX IF NOT EXISTS idx_submissions_teaching_load 
ON submissions(teaching_load_id);

-- Add index for compliance status lookups
CREATE INDEX IF NOT EXISTS idx_submissions_compliance_status 
ON submissions(compliance_status);

-- Add index for combined lookups
CREATE INDEX IF NOT EXISTS idx_submissions_user_teaching_load 
ON submissions(user_id, teaching_load_id);

-- Update RLS policy to allow access to submissions with teaching loads
-- (the existing policy "Anyone can verify by hash" already allows public verification)

-- Optional: Add function to automatically calculate compliance status
-- This function will be called by the application when inserting submissions
CREATE OR REPLACE FUNCTION calculate_compliance_status(submission_date TIMESTAMPTZ)
RETURNS TEXT AS $$
DECLARE
  day_of_week INTEGER;
  status TEXT;
BEGIN
  -- Get the day of week (1 = Monday, 7 = Sunday in PostgreSQL)
  day_of_week := EXTRACT(DOW FROM submission_date);
  
  -- Map day of week to compliance status
  CASE day_of_week
    WHEN 1 THEN status := 'on-time';      -- Monday
    WHEN 2 THEN status := 'late';         -- Tuesday
    ELSE status := 'missing';              -- Wednesday (3) to Sunday (0)
  END CASE;
  
  RETURN status;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test the function
-- SELECT calculate_compliance_status(NOW());
