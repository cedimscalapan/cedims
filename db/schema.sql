-- ═══════════════════════════════════════════════════════════════
-- Smart E-VISION 2.0 — Complete Database Schema
-- Supabase PostgreSQL with Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── HIERARCHY ───────────────────────────────────────────────

-- Divisions (e.g., DepEd Calapan City)
CREATE TABLE IF NOT EXISTS divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Districts within a Division (e.g., Calapan East)
CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(division_id, name)
);

-- Schools within a District
CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(district_id, name)
);

-- ─── USER PROFILES ──────────────────────────────────────────

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('Teacher', 'School Head', 'Master Teacher', 'District Supervisor')),
    school_id UUID REFERENCES schools(id),
    district_id UUID REFERENCES districts(id),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    push_subscription JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()

    -- (Constraints removed to allow flexible onboarding/manual creation)
);

-- ─── ACADEMIC CALENDAR ──────────────────────────────────────

CREATE TABLE academic_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    term INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
    week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 52),
    deadline_date TIMESTAMPTZ NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(district_id, school_year, term, week_number)
);

-- ─── TEACHING LOADS ─────────────────────────────────────────

CREATE TABLE teaching_loads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    grade_level TEXT NOT NULL,
    subject TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, grade_level, subject)
);

-- ─── SUBMISSIONS ────────────────────────────────────────────

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size INTEGER,
    doc_type TEXT CHECK (doc_type IN ('DLL', 'ISP', 'ISR', 'Unknown')),
    week_number INTEGER,
    subject TEXT,
    school_year TEXT,
    calendar_id UUID REFERENCES academic_calendar(id),
    teaching_load_id UUID REFERENCES teaching_loads(id) ON DELETE SET NULL,
    compliance_status TEXT DEFAULT 'non-compliant' CHECK (compliance_status IN ('compliant', 'late', 'non-compliant')),
    ai_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for hash lookups (verification)
CREATE INDEX idx_submissions_file_hash ON submissions(file_hash);

-- ─── SUBMISSION REVIEWS ─────────────────────────────────────

CREATE TABLE submission_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES profiles(id) NOT NULL,
    comment TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AUDIT LOGS ──────────────────────────────────────────────

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    prev_hash TEXT,
    current_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SYSTEM SETTINGS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_calendar ENABLE ROW LEVEL SECURITY;

-- ─── System Settings Table (WBS 19.3) ───
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ─── Profiles RLS ───
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
    ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Supervisors can manage all profiles" ON profiles;
CREATE POLICY "Supervisors can manage all profiles"
    ON profiles FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'District Supervisor'
        )
    );

-- ─── System Settings RLS ───
DROP POLICY IF EXISTS "Authenticated users can view settings" ON system_settings;
CREATE POLICY "Authenticated users can view settings"
    ON system_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors can manage settings" ON system_settings;
CREATE POLICY "Supervisors can manage settings"
    ON system_settings FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'District Supervisor'
        )
    );


-- ─── Submissions ───
DROP POLICY IF EXISTS "Teachers can manage own submissions" ON submissions;
CREATE POLICY "Teachers can manage own submissions"
    ON submissions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "School heads can view school submissions" ON submissions;
CREATE POLICY "School heads can view school submissions"
    ON submissions FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles viewer
            JOIN profiles uploader ON uploader.id = submissions.user_id
            WHERE viewer.id = auth.uid()
            AND viewer.role IN ('School Head', 'Master Teacher')
            AND viewer.school_id = uploader.school_id
        )
    );

DROP POLICY IF EXISTS "Anyone can verify by hash" ON submissions;
CREATE POLICY "Anyone can verify by hash"
    ON submissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Supervisors can view all submissions" ON submissions;
CREATE POLICY "Supervisors can view all submissions"
    ON submissions FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles viewer
            WHERE viewer.id = auth.uid()
            AND viewer.role = 'District Supervisor'
        )
    );

-- ─── Teaching Loads ───
DROP POLICY IF EXISTS "Teachers manage own loads" ON teaching_loads;
CREATE POLICY "Teachers manage own loads"
    ON teaching_loads FOR ALL USING (auth.uid() = user_id);

-- ─── Read-only tables ───
DROP POLICY IF EXISTS "All authenticated users can view schools" ON schools;
CREATE POLICY "All authenticated users can view schools"
    ON schools FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "All authenticated users can view districts" ON districts;
CREATE POLICY "All authenticated users can view districts"
    ON districts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "All authenticated users can view divisions" ON divisions;
CREATE POLICY "All authenticated users can view divisions"
    ON divisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "All authenticated users can view calendar" ON academic_calendar;
CREATE POLICY "All authenticated users can view calendar"
    ON academic_calendar FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "District supervisors can manage calendar" ON academic_calendar;
CREATE POLICY "District supervisors can manage calendar"
    ON academic_calendar FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() 
              AND role IN ('District Supervisor', 'School Head', 'Master Teacher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() 
              AND role IN ('District Supervisor', 'School Head', 'Master Teacher')
              AND (
                -- District Supervisor: can manage any calendar in their district
                (role = 'District Supervisor' AND district_id = academic_calendar.district_id)
                -- School Head: can manage calendar for their school's district
                OR (role = 'School Head' AND school_id IN (
                    SELECT id FROM public.schools WHERE district_id = academic_calendar.district_id
                ))
                -- Master Teacher: can manage calendar for their school's district
                OR (role = 'Master Teacher' AND school_id IN (
                    SELECT id FROM public.schools WHERE district_id = academic_calendar.district_id
                ))
              )
        )
    );

-- ─── Reviews ───
DROP POLICY IF EXISTS "Reviewers can create reviews" ON submission_reviews;
CREATE POLICY "Reviewers can create reviews"
    ON submission_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Users can view reviews on their submissions" ON submission_reviews;
CREATE POLICY "Users can view reviews on their submissions"
    ON submission_reviews FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.id = submission_reviews.submission_id
            AND (s.user_id = auth.uid() OR submission_reviews.reviewer_id = auth.uid())
        )
    );

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA — Calapan East District Pilot
-- ═══════════════════════════════════════════════════════════════

INSERT INTO divisions (id, name) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'DepEd Calapan City')
ON CONFLICT (id) DO NOTHING;

INSERT INTO districts (id, division_id, name) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Calapan East District')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, district_id, name) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Bulusan Elementary School'),
    ('e0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Guinobatan Elementary School'),
    ('e0000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'Ibaba Elementary School'),
    ('e0000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'Salong Elementary School'),
    ('e0000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'Suqui Elementary School')
ON CONFLICT (id) DO NOTHING;

-- ─── Academic Calendar (2025-2026 Sample for Pilot) ───
INSERT INTO academic_calendar (district_id, school_year, term, week_number, deadline_date, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000001', '2025-2026', 1, 1, '2025-08-25 23:59:59+08', TRUE),
    ('d1000000-0000-0000-0000-000000000001', '2025-2026', 1, 2, '2025-09-01 23:59:59+08', TRUE),
    ('d1000000-0000-0000-0000-000000000001', '2025-2026', 1, 3, '2025-09-08 23:59:59+08', TRUE)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- STORAGE BUCKET & POLICIES
-- ═══════════════════════════════════════════════════════════════

-- Create the bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
-- Note: Submissions are stored in 'submissions/{user_id}/{filename}'

-- 1. Allow uploader to insert their own files
DROP POLICY IF EXISTS "Users can upload own submissions" ON storage.objects;
CREATE POLICY "Users can upload own submissions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'submissions' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Allow uploader to view their own files
DROP POLICY IF EXISTS "Users can view own storage" ON storage.objects;
CREATE POLICY "Users can view own storage"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'submissions' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Allow supervisors to view all submissions
DROP POLICY IF EXISTS "Supervisors can view all storage" ON storage.objects;
CREATE POLICY "Supervisors can view all storage"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'submissions' AND 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'District Supervisor'
    )
);

-- 4. Allow school heads to view their school's storage
DROP POLICY IF EXISTS "School heads can view school storage" ON storage.objects;
CREATE POLICY "School heads can view school storage"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'submissions' AND 
    EXISTS (
        SELECT 1 FROM public.profiles viewer
        WHERE viewer.id = auth.uid()
        AND viewer.role IN ('School Head', 'Master Teacher')
        AND viewer.school_id = (
            SELECT school_id FROM public.profiles 
            WHERE id::text = (storage.foldername(storage.objects.name))[1]
        )
    )
);

-- 1. Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, school_id, district_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', SPLIT_PART(new.email, '@', 1)),
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'Teacher'),
    CASE 
      WHEN (new.raw_user_meta_data->>'school_id') IS NOT NULL AND (new.raw_user_meta_data->>'school_id') != '' 
      THEN (new.raw_user_meta_data->>'school_id')::uuid 
      ELSE NULL 
    END,
    CASE 
      WHEN (new.raw_user_meta_data->>'district_id') IS NOT NULL AND (new.raw_user_meta_data->>'district_id') != '' 
      THEN (new.raw_user_meta_data->>'district_id')::uuid 
      ELSE NULL 
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on the auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- Phase 5.2: Performance & Optimization Indexes
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_submissions_user_week ON submissions(user_id, week_number);
CREATE INDEX IF NOT EXISTS idx_submissions_compliance ON submissions(compliance_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_district ON profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_academic_calendar_sy_week ON academic_calendar(school_year, week_number);

-- ─── Phase 4.2 Support: Web Push Subscriptions ───
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_subscription JSONB;

-- ═══════════════════════════════════════════════════════════════
-- Phase 6: Institutional RLS (Branding/Avatars)
-- ═══════════════════════════════════════════════════════════════

-- 1. SELECT: Authenticated users can view all schools and districts
DROP POLICY IF EXISTS "Authenticated users can view schools" ON schools;
CREATE POLICY "Authenticated users can view schools"
ON schools FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can view districts" ON districts;
CREATE POLICY "Authenticated users can view districts"
ON districts FOR SELECT TO authenticated
USING (true);

-- 2. UPDATE: School Heads can update their own school's avatar_url
DROP POLICY IF EXISTS "School Heads can update own school logo" ON schools;
CREATE POLICY "School Heads can update own school logo"
ON schools FOR UPDATE TO authenticated
USING (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'School Head')
)
WITH CHECK (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'School Head')
);

-- 3. UPDATE: District Supervisors can update their own district's avatar_url
DROP POLICY IF EXISTS "District Supervisors can update own district logo" ON districts;
CREATE POLICY "District Supervisors can update own district logo"
ON districts FOR UPDATE TO authenticated
USING (
    id = (SELECT district_id FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor')
)
WITH CHECK (
    id = (SELECT district_id FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor')
);
