-- ═══════════════════════════════════════════════════════════════════════════════
-- MATATAG Curriculum Subjects — Grade-to-Subject Mapping
-- Based on DepEd MATATAG Curriculum Guide (SY 2026-2027, Trimester)
-- Source: https://www.teachpinas.com/matatag-curriculum-guide-pdf-all-subjects/
-- ═══════════════════════════════════════════════════════════════════════════════
-- Usage:
--   CREATE TABLE + INSERT once.
--   Frontend fetches: SELECT * FROM curriculum_subjects WHERE grade_level = '1' ORDER BY subject;
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS curriculum_subjects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_level TEXT NOT NULL CHECK (grade_level IN ('Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6')),
    subject    TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(grade_level, subject)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE curriculum_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can view curriculum" ON curriculum_subjects;
CREATE POLICY "All authenticated users can view curriculum"
    ON curriculum_subjects FOR SELECT TO authenticated USING (true);

-- ── Seed Data — MATATAG Learning Areas per Grade Level ───────────────────────

-- Grade 1 (5 subjects)
INSERT INTO curriculum_subjects (grade_level, subject, sort_order) VALUES
    ('Grade 1', 'Language',             1),
    ('Grade 1', 'Reading and Literacy', 2),
    ('Grade 1', 'Mathematics',          3),
    ('Grade 1', 'GMRC',                 4),
    ('Grade 1', 'Makabansa',            5)
ON CONFLICT DO NOTHING;

-- Grade 2 (5 subjects)
INSERT INTO curriculum_subjects (grade_level, subject, sort_order) VALUES
    ('Grade 2', 'Filipino',   1),
    ('Grade 2', 'English',    2),
    ('Grade 2', 'Mathematics',3),
    ('Grade 2', 'GMRC',       4),
    ('Grade 2', 'Makabansa',  5)
ON CONFLICT DO NOTHING;

-- Grade 3 (6 subjects)
INSERT INTO curriculum_subjects (grade_level, subject, sort_order) VALUES
    ('Grade 3', 'Filipino',   1),
    ('Grade 3', 'English',    2),
    ('Grade 3', 'Mathematics',3),
    ('Grade 3', 'Science',    4),
    ('Grade 3', 'GMRC',       5),
    ('Grade 3', 'Makabansa',  6)
ON CONFLICT DO NOTHING;

-- Grades 4, 5, 6 (8 subjects each)
INSERT INTO curriculum_subjects (grade_level, subject, sort_order) VALUES
    ('Grade 4', 'Filipino',               1),
    ('Grade 4', 'English',                2),
    ('Grade 4', 'Mathematics',            3),
    ('Grade 4', 'Science',                4),
    ('Grade 4', 'Araling Panlipunan',     5),
    ('Grade 4', 'MAPEH',                  6),
    ('Grade 4', 'GMRC',                   7),
    ('Grade 4', 'EPP/TLE',                8),
    ('Grade 5', 'Filipino',               1),
    ('Grade 5', 'English',                2),
    ('Grade 5', 'Mathematics',            3),
    ('Grade 5', 'Science',                4),
    ('Grade 5', 'Araling Panlipunan',     5),
    ('Grade 5', 'MAPEH',                  6),
    ('Grade 5', 'GMRC',                   7),
    ('Grade 5', 'EPP/TLE',                8),
    ('Grade 6', 'Filipino',               1),
    ('Grade 6', 'English',                2),
    ('Grade 6', 'Mathematics',            3),
    ('Grade 6', 'Science',                4),
    ('Grade 6', 'Araling Panlipunan',     5),
    ('Grade 6', 'MAPEH',                  6),
    ('Grade 6', 'GMRC',                   7),
    ('Grade 6', 'EPP/TLE',                8)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Frontend Helper Query
-- ═══════════════════════════════════════════════════════════════════════════════
-- Dropdown 1 (Grade Level):
--   SELECT DISTINCT grade_level FROM curriculum_subjects ORDER BY grade_level;
-- 
-- Dropdown 2 (Subject, filtered by selected grade):
--   SELECT subject FROM curriculum_subjects WHERE grade_level = '1' ORDER BY sort_order;
-- ═══════════════════════════════════════════════════════════════════════════════
