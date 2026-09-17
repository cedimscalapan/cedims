-- ═══════════════════════════════════════════════════════════════════════════
-- CEDIMS — Switch to DepEd Three-Term (Trimester) Calendar + Waiting State
--
-- DepEd Order No. 009, s. 2026 replaces the four-quarter system with a
-- three-term calendar starting SY 2026-2027. This migration:
--   1. Renames academic_calendar.quarter  -> term
--      and relaxes the check to BETWEEN 1 AND 3 (Terms 1-3).
--   2. Adds is_active BOOLEAN (waiting state). Generated weeks start INACTIVE
--      so they are hidden from teachers and excluded from compliance totals
--      until a supervisor activates them. Existing rows are marked active so
--      current data stays visible.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE academic_calendar RENAME COLUMN quarter TO term;

-- Relax the check constraint (1-3 instead of 1-4)
ALTER TABLE academic_calendar DROP CONSTRAINT IF EXISTS academic_calendar_quarter_check;
ALTER TABLE academic_calendar ADD CONSTRAINT academic_calendar_term_check
    CHECK (term BETWEEN 1 AND 3);

-- Rebuild the unique key to use the renamed column
ALTER TABLE academic_calendar DROP CONSTRAINT IF EXISTS academic_calendar_district_id_school_year_quarter_week_number_key;
ALTER TABLE academic_calendar ADD CONSTRAINT academic_calendar_district_id_school_year_term_week_number_key
    UNIQUE (district_id, school_year, term, week_number);

-- Waiting-state column: weeks start inactive and are manually activated.
ALTER TABLE academic_calendar ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep any existing weeks visible so they are not silently hidden.
UPDATE academic_calendar SET is_active = TRUE WHERE is_active = FALSE;

-- Index to speed up active-week lookups.
CREATE INDEX IF NOT EXISTS idx_academic_calendar_sy_term_active
    ON academic_calendar(school_year, term, is_active);
