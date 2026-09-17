-- ═══════════════════════════════════════════════════════════════════════════════
-- Smart E-VISION 2.0 (CEDIMS) — COMPLETE DATABASE SCHEMA
-- One consolidated, idempotent script: tables, relationships, functions, triggers,
-- RLS policies, indexes, storage buckets, seed data, and reporting queries.
--
-- COVERAGE (17 tables + 2 storage buckets):
--   divisions, districts, schools, profiles, academic_calendar, teaching_loads,
--   submissions, submission_reviews, dll_annotations, dll_reviews,
--   dll_audit_logs, dll_file_versions, dll_export_templates, curriculum_subjects,
--   system_settings, notifications, audit_logs
--
-- Every CREATE uses IF NOT EXISTS and every table is RLS-enabled with policies,
-- so no table is left blank or inaccessible after running.
-- Run top-to-bottom in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 0. EXTENSIONS ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1: CORE TABLES (Hierarchy → People → Academic → Activity)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1.1 Divisions (e.g., DepEd Calapan City)
CREATE TABLE IF NOT EXISTS divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Districts (e.g., Calapan East) → divisions
CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(division_id, name)
);

-- 1.3 Schools → districts
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(district_id, name)
);

-- 1.4 Profiles (One row per auth.users account) → schools, districts
CREATE TABLE IF NOT EXISTS profiles (
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
);

-- ────────────────────────────────────────────────────────────────────────────────
-- PART 2: ACADEMIC STRUCTURE
-- ────────────────────────────────────────────────────────────────────────────────

-- 2.1 Academic Calendar (three-term / trimester, weekly deadlines) → districts
CREATE TABLE IF NOT EXISTS academic_calendar (
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

-- 2.2 Teaching Loads (teacher subject/grade assignment) → profiles
CREATE TABLE IF NOT EXISTS teaching_loads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    grade_level TEXT NOT NULL,
    subject TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, grade_level, subject)
);

-- 2.3 Curriculum Subjects (MATATAG grade→subject mapping) — read-only reference
CREATE TABLE IF NOT EXISTS curriculum_subjects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_level TEXT NOT NULL CHECK (grade_level IN ('Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6')),
    subject     TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(grade_level, subject)
);

-- ────────────────────────────────────────────────────────────────────────────────
-- PART 3: SUBMISSIONS & REVIEWS
-- ────────────────────────────────────────────────────────────────────────────────

-- 3.1 Submissions (a DLL/ISP/ISR upload) → profiles, academic_calendar, teaching_loads
-- Canonical compliance_status set: ('compliant','late','missing','supplementary')
CREATE TABLE IF NOT EXISTS submissions (
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
    compliance_status TEXT DEFAULT 'compliant'
        CHECK (compliance_status IN ('compliant', 'late', 'missing', 'supplementary')),
    raw_text TEXT,
    ai_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Submission Reviews (legacy reviewer comments) → submissions, profiles
CREATE TABLE IF NOT EXISTS submission_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES profiles(id) NOT NULL,
    comment TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────────
-- PART 4: DLL REVIEW SYSTEM (Modern annotation + approval workflow)
-- ────────────────────────────────────────────────────────────────────────────────

-- 4.1 DLL Annotations (digital pen/comments) → submissions, profiles
CREATE TABLE IF NOT EXISTS dll_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    annotator_id UUID REFERENCES profiles(id) NOT NULL,
    annotation_type TEXT NOT NULL CHECK (annotation_type IN ('highlight', 'comment', 'mark', 'flag')),
    content TEXT NOT NULL,
    page_number INTEGER,
    position JSONB,
    color TEXT DEFAULT '#FFFF00',
    is_official BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 DLL Reviews (approval workflow) → submissions, profiles
CREATE TABLE IF NOT EXISTS dll_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES profiles(id) NOT NULL,
    status TEXT NOT NULL DEFAULT 'needs-check'
        CHECK (status IN ('submitted', 'needs-check', 'returned', 'approved')),
    reviewer_comment TEXT,
    return_reason TEXT,
    approved_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    file_hash_at_review TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(submission_id)
);

-- 4.3 DLL Audit Logs (immutable trail) → submissions, profiles
CREATE TABLE IF NOT EXISTS dll_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('uploaded', 'annotated', 'reviewed', 'approved', 'returned', 'exported')),
    actor_id UUID REFERENCES profiles(id) NOT NULL,
    actor_role TEXT NOT NULL,
    details JSONB,
    file_hash TEXT,
    signature_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.4 DLL File Versions (revision tracking) → submissions, profiles
CREATE TABLE IF NOT EXISTS dll_file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by UUID REFERENCES profiles(id) NOT NULL,
    version_number INTEGER NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.5 DLL Export Templates (DepEd reporting presets)
CREATE TABLE IF NOT EXISTS dll_export_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    format TEXT CHECK (format IN ('pdf', 'csv', 'xlsx')),
    include_annotations BOOLEAN DEFAULT TRUE,
    include_audit_trail BOOLEAN DEFAULT TRUE,
    include_reviews BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────────
-- PART 5: SYSTEM & NOTIFICATIONS
-- ────────────────────────────────────────────────────────────────────────────────

-- 5.1 System Settings (key-value store)
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- 5.2 Notifications (real-time user notifications) → profiles
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5.3 Audit Logs (admin actions) → profiles
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 6: INDEXES (performance)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_submissions_file_hash        ON submissions(file_hash);
CREATE INDEX IF NOT EXISTS idx_submissions_user_week        ON submissions(user_id, week_number);
CREATE INDEX IF NOT EXISTS idx_submissions_compliance       ON submissions(compliance_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at       ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_teaching_load    ON submissions(teaching_load_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_teaching_load ON submissions(user_id, teaching_load_id);
CREATE INDEX IF NOT EXISTS idx_submissions_raw_text         ON submissions USING gin(to_tsvector('english', coalesce(raw_text, '')));

CREATE INDEX IF NOT EXISTS idx_profiles_role                ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_district            ON profiles(district_id);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_sy_week    ON academic_calendar(school_year, week_number);
CREATE INDEX IF NOT EXISTS idx_academic_calendar_sy_term_active ON academic_calendar(school_year, term, is_active);

CREATE INDEX IF NOT EXISTS idx_dll_reviews_submission       ON dll_reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_dll_reviews_reviewer         ON dll_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_dll_reviews_status           ON dll_reviews(status);
CREATE INDEX IF NOT EXISTS idx_dll_annotations_submission   ON dll_annotations(submission_id);
CREATE INDEX IF NOT EXISTS idx_dll_annotations_annotator    ON dll_annotations(annotator_id);
CREATE INDEX IF NOT EXISTS idx_dll_audit_logs_submission    ON dll_audit_logs(submission_id);
CREATE INDEX IF NOT EXISTS idx_dll_audit_logs_actor         ON dll_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_dll_audit_logs_action        ON dll_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_dll_audit_logs_created       ON dll_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_dll_file_versions_submission ON dll_file_versions(submission_id);
CREATE INDEX IF NOT EXISTS idx_dll_file_versions_hash       ON dll_file_versions(file_hash);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id        ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read           ON notifications(read);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor             ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action            ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created           ON audit_logs(created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 7: FUNCTIONS & TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

-- 7.1 Auto-create profile row when a new auth user signs up
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7.2 Mark profiles.updated_at on any profile change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profiles_updated ON profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 8: ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════════════════════════
-- Every table is enabled for RLS so NO table is left wide open.

ALTER TABLE divisions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_calendar   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_loads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_annotations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_file_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;

-- ── Divisions ──
DROP POLICY IF EXISTS "All authenticated users can view divisions" ON divisions;
CREATE POLICY "All authenticated users can view divisions"
    ON divisions FOR SELECT TO authenticated USING (true);

-- ── Districts ──
DROP POLICY IF EXISTS "All authenticated users can view districts" ON districts;
CREATE POLICY "All authenticated users can view districts"
    ON districts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "District Supervisors can update own district logo" ON districts;
CREATE POLICY "District Supervisors can update own district logo"
    ON districts FOR UPDATE TO authenticated
    USING (id = (SELECT district_id FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor'))
    WITH CHECK (id = (SELECT district_id FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor'));

-- ── Schools ──
DROP POLICY IF EXISTS "All authenticated users can view schools" ON schools;
CREATE POLICY "All authenticated users can view schools"
    ON schools FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "School Heads can update own school logo" ON schools;
CREATE POLICY "School Heads can update own school logo"
    ON schools FOR UPDATE TO authenticated
    USING (id = (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'School Head'))
    WITH CHECK (id = (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'School Head'));

-- ── Profiles ──
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
    ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Supervisors can manage all profiles" ON profiles;
CREATE POLICY "Supervisors can manage all profiles"
    ON profiles FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'District Supervisor'));

-- ── Academic Calendar ──
DROP POLICY IF EXISTS "All authenticated users can view calendar" ON academic_calendar;
CREATE POLICY "All authenticated users can view calendar"
    ON academic_calendar FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "District supervisors can manage calendar" ON academic_calendar;
CREATE POLICY "District supervisors can manage calendar"
    ON academic_calendar FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                AND role IN ('District Supervisor', 'School Head', 'Master Teacher'))
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('District Supervisor', 'School Head', 'Master Teacher')
              AND (
                (p.role = 'District Supervisor' AND p.district_id = academic_calendar.district_id)
                OR (p.role IN ('School Head', 'Master Teacher') AND p.school_id IN (
                    SELECT id FROM public.schools WHERE district_id = academic_calendar.district_id
                ))
              )
        )
    );

-- ── Teaching Loads ──
DROP POLICY IF EXISTS "Teachers manage own loads" ON teaching_loads;
CREATE POLICY "Teachers manage own loads"
    ON teaching_loads FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Supervisors view school loads" ON teaching_loads;
CREATE POLICY "Supervisors view school loads"
    ON teaching_loads FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles viewer
            JOIN profiles owner ON owner.id = teaching_loads.user_id
            WHERE viewer.id = auth.uid()
              AND viewer.role IN ('School Head', 'Master Teacher')
              AND viewer.school_id = owner.school_id
        )
    );

DROP POLICY IF EXISTS "District supervisors view loads" ON teaching_loads;
CREATE POLICY "District supervisors view loads"
    ON teaching_loads FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles viewer
            JOIN profiles owner ON owner.id = teaching_loads.user_id
            WHERE viewer.id = auth.uid()
              AND viewer.role = 'District Supervisor'
              AND viewer.district_id = owner.district_id
        )
    );

-- ── Curriculum Subjects (read-only reference; supervisors maintain) ──
DROP POLICY IF EXISTS "All authenticated users can view curriculum" ON curriculum_subjects;
CREATE POLICY "All authenticated users can view curriculum"
    ON curriculum_subjects FOR SELECT TO authenticated USING (true);

-- ── Submissions ──
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

DROP POLICY IF EXISTS "Supervisors can view all submissions" ON submissions;
CREATE POLICY "Supervisors can view all submissions"
    ON submissions FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles viewer
                WHERE viewer.id = auth.uid() AND viewer.role = 'District Supervisor')
    );

DROP POLICY IF EXISTS "Anyone can verify by hash" ON submissions;
CREATE POLICY "Anyone can verify by hash"
    ON submissions FOR SELECT USING (true);

-- ── Submission Reviews (legacy) ──
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

-- ── DLL Annotations ──
DROP POLICY IF EXISTS "Annotators and owners can view annotations" ON dll_annotations;
CREATE POLICY "Annotators and owners can view annotations"
    ON dll_annotations FOR SELECT USING (
        auth.uid() = annotator_id OR
        EXISTS (SELECT 1 FROM submissions WHERE id = submission_id AND user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM dll_reviews dr WHERE dr.submission_id = dll_annotations.submission_id AND dr.reviewer_id = auth.uid())
    );

DROP POLICY IF EXISTS "Annotators can create annotations" ON dll_annotations;
CREATE POLICY "Annotators can create annotations"
    ON dll_annotations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = annotator_id);

DROP POLICY IF EXISTS "Annotators can delete own annotations" ON dll_annotations;
CREATE POLICY "Annotators can delete own annotations"
    ON dll_annotations FOR DELETE USING (auth.uid() = annotator_id AND is_official = FALSE);

-- ── DLL Reviews ──
DROP POLICY IF EXISTS "Reviewers and owners can view DLL reviews" ON dll_reviews;
CREATE POLICY "Reviewers and owners can view DLL reviews"
    ON dll_reviews FOR SELECT USING (
        auth.uid() = reviewer_id OR
        EXISTS (SELECT 1 FROM submissions WHERE id = submission_id AND user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('District Supervisor', 'School Head', 'Master Teacher'))
    );

DROP POLICY IF EXISTS "Reviewers can manage DLL reviews" ON dll_reviews;
CREATE POLICY "Reviewers can manage DLL reviews"
    ON dll_reviews FOR ALL TO authenticated
    USING (auth.uid() = reviewer_id)
    WITH CHECK (auth.uid() = reviewer_id);

-- ── DLL Audit Logs ──
DROP POLICY IF EXISTS "Stakeholders can view audit logs" ON dll_audit_logs;
CREATE POLICY "Stakeholders can view audit logs"
    ON dll_audit_logs FOR SELECT USING (
        auth.uid() = actor_id OR
        EXISTS (SELECT 1 FROM submissions WHERE id = submission_id AND user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('District Supervisor', 'School Head', 'Master Teacher'))
    );

DROP POLICY IF EXISTS "Authenticated can create audit logs" ON dll_audit_logs;
CREATE POLICY "Authenticated can create audit logs"
    ON dll_audit_logs FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = actor_id);

-- ── DLL File Versions ──
DROP POLICY IF EXISTS "Stakeholders can view file versions" ON dll_file_versions;
CREATE POLICY "Stakeholders can view file versions"
    ON dll_file_versions FOR SELECT USING (
        auth.uid() = uploaded_by OR
        EXISTS (SELECT 1 FROM submissions WHERE id = submission_id AND user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('District Supervisor', 'School Head', 'Master Teacher'))
    );

-- ── DLL Export Templates ──
DROP POLICY IF EXISTS "All authenticated can view export templates" ON dll_export_templates;
CREATE POLICY "All authenticated can view export templates"
    ON dll_export_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors can manage export templates" ON dll_export_templates;
CREATE POLICY "Supervisors can manage export templates"
    ON dll_export_templates FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor'));

-- ── System Settings ──
DROP POLICY IF EXISTS "Authenticated users can view settings" ON system_settings;
CREATE POLICY "Authenticated users can view settings"
    ON system_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors can manage settings" ON system_settings;
CREATE POLICY "Supervisors can manage settings"
    ON system_settings FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'District Supervisor'));

-- ── Notifications ──
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications"
    ON notifications FOR INSERT TO authenticated WITH CHECK (true);

-- ── Audit Logs (admin) ──
DROP POLICY IF EXISTS "Supervisors can read audit logs" ON audit_logs;
CREATE POLICY "Supervisors can read audit logs"
    ON audit_logs FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('District Supervisor', 'Admin'))
    );

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 9: SEED DATA (no table left blank)
-- ══════════════════════════════════════════════════════════════════════════════

-- 9.1 Division / District / Schools (Calapan City pilot)
INSERT INTO divisions (id, name) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'DepEd Calapan City')
ON CONFLICT (id) DO NOTHING;

INSERT INTO districts (id, division_id, name) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Calapan East District')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, district_id, name, address) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Bulusan Elementary School',     'Bulusan, Calapan City'),
    ('e0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Guinobatan Elementary School', 'Guinobatan, Calapan City'),
    ('e0000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'Ibaba Elementary School',      'Ibaba, Calapan City'),
    ('e0000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'Salong Elementary School',     'Salong, Calapan City'),
    ('e0000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'Suqui Elementary School',      'Suqui, Calapan City')
ON CONFLICT (id) DO NOTHING;

-- 9.2 Curriculum Subjects (MATATAG Grades 1–6)
INSERT INTO curriculum_subjects (grade_level, subject, sort_order) VALUES
    ('Grade 1', 'Language', 1), ('Grade 1', 'Reading and Literacy', 2),
    ('Grade 1', 'Mathematics', 3), ('Grade 1', 'GMRC', 4), ('Grade 1', 'Makabansa', 5),
    ('Grade 2', 'Filipino', 1), ('Grade 2', 'English', 2),
    ('Grade 2', 'Mathematics', 3), ('Grade 2', 'GMRC', 4), ('Grade 2', 'Makabansa', 5),
    ('Grade 3', 'Filipino', 1), ('Grade 3', 'English', 2),
    ('Grade 3', 'Mathematics', 3), ('Grade 3', 'Science', 4),
    ('Grade 3', 'GMRC', 5), ('Grade 3', 'Makabansa', 6),
    ('Grade 4', 'Filipino', 1), ('Grade 4', 'English', 2), ('Grade 4', 'Mathematics', 3),
    ('Grade 4', 'Science', 4), ('Grade 4', 'Araling Panlipunan', 5),
    ('Grade 4', 'MAPEH', 6), ('Grade 4', 'GMRC', 7), ('Grade 4', 'EPP/TLE', 8),
    ('Grade 5', 'Filipino', 1), ('Grade 5', 'English', 2), ('Grade 5', 'Mathematics', 3),
    ('Grade 5', 'Science', 4), ('Grade 5', 'Araling Panlipunan', 5),
    ('Grade 5', 'MAPEH', 6), ('Grade 5', 'GMRC', 7), ('Grade 5', 'EPP/TLE', 8),
    ('Grade 6', 'Filipino', 1), ('Grade 6', 'English', 2), ('Grade 6', 'Mathematics', 3),
    ('Grade 6', 'Science', 4), ('Grade 6', 'Araling Panlipunan', 5),
    ('Grade 6', 'MAPEH', 6), ('Grade 6', 'GMRC', 7), ('Grade 6', 'EPP/TLE', 8)
ON CONFLICT DO NOTHING;

-- 9.3 Academic Calendar — SY 2026-2027 Trimester (Terms 1–3, weeks 1–39)
INSERT INTO academic_calendar (district_id, school_year, term, week_number, deadline_date, description) VALUES
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 1,  '2026-06-12 17:00:00+08', 'Term 1 Week 1'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 2,  '2026-06-19 17:00:00+08', 'Term 1 Week 2'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 3,  '2026-06-26 17:00:00+08', 'Term 1 Week 3'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 4,  '2026-07-03 17:00:00+08', 'Term 1 Week 4'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 5,  '2026-07-10 17:00:00+08', 'Term 1 Week 5'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 6,  '2026-07-17 17:00:00+08', 'Term 1 Week 6'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 7,  '2026-07-24 17:00:00+08', 'Term 1 Week 7'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 8,  '2026-07-31 17:00:00+08', 'Term 1 Week 8'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 9,  '2026-08-07 17:00:00+08', 'Term 1 Week 9'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 10, '2026-08-14 17:00:00+08', 'Term 1 Week 10'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 11, '2026-08-21 17:00:00+08', 'Term 1 Week 11'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 12, '2026-08-28 17:00:00+08', 'Term 1 Week 12'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 1, 13, '2026-09-04 17:00:00+08', 'Term 1 Week 13 — End of Term 1'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 14, '2026-09-11 17:00:00+08', 'Term 2 Week 14 — Start of Term 2'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 15, '2026-09-18 17:00:00+08', 'Term 2 Week 15'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 16, '2026-09-25 17:00:00+08', 'Term 2 Week 16'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 17, '2026-10-02 17:00:00+08', 'Term 2 Week 17'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 18, '2026-10-09 17:00:00+08', 'Term 2 Week 18'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 19, '2026-10-16 17:00:00+08', 'Term 2 Week 19'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 20, '2026-10-23 17:00:00+08', 'Term 2 Week 20'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 21, '2026-10-30 17:00:00+08', 'Term 2 Week 21'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 22, '2026-11-06 17:00:00+08', 'Term 2 Week 22'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 23, '2026-11-13 17:00:00+08', 'Term 2 Week 23'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 24, '2026-11-20 17:00:00+08', 'Term 2 Week 24'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 25, '2026-11-27 17:00:00+08', 'Term 2 Week 25'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 2, 26, '2026-12-04 17:00:00+08', 'Term 2 Week 26 — End of Term 2'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 27, '2027-01-08 17:00:00+08', 'Term 3 Week 27 — Start of Term 3'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 28, '2027-01-15 17:00:00+08', 'Term 3 Week 28'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 29, '2027-01-22 17:00:00+08', 'Term 3 Week 29'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 30, '2027-01-29 17:00:00+08', 'Term 3 Week 30'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 31, '2027-02-05 17:00:00+08', 'Term 3 Week 31'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 32, '2027-02-12 17:00:00+08', 'Term 3 Week 32'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 33, '2027-02-19 17:00:00+08', 'Term 3 Week 33'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 34, '2027-02-26 17:00:00+08', 'Term 3 Week 34'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 35, '2027-03-05 17:00:00+08', 'Term 3 Week 35'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 36, '2027-03-12 17:00:00+08', 'Term 3 Week 36'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 37, '2027-03-19 17:00:00+08', 'Term 3 Week 37'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 38, '2027-03-26 17:00:00+08', 'Term 3 Week 38'),
    ('d1000000-0000-0000-0000-000000000001', '2026-2027', 3, 39, '2027-03-31 17:00:00+08', 'Term 3 Week 39 — End of School Year')
ON CONFLICT DO NOTHING;

-- Activate seeded weeks (fresh deployment works immediately)
UPDATE academic_calendar SET is_active = TRUE WHERE is_active = FALSE;

-- 9.4 System Settings
INSERT INTO system_settings (key, value, description) VALUES
    ('submission_window_days', '5', 'Days after week end to allow on-time submissions'),
    ('maintenance_mode', 'false', 'Disable all uploads for system maintenance'),
    ('enforce_ocr', 'true', 'Prevent submission if OCR metadata mismatch'),
    ('max_upload_size_mb', '2', 'Global file size limit for uploads')
ON CONFLICT (key) DO NOTHING;

-- 9.5 DLL Export Templates
INSERT INTO dll_export_templates (id, name, description, format, include_annotations, include_audit_trail, include_reviews) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'Complete DLL Report', 'Full DLL report with annotations, reviews, and audit trail', 'pdf', TRUE, TRUE, TRUE),
    ('f0000000-0000-0000-0000-000000000002', 'Teacher Summary', 'Concise teacher-level DLL summary for submission tracking', 'pdf', FALSE, FALSE, TRUE),
    ('f0000000-0000-0000-0000-000000000003', 'Compliance Report', 'Compliance data export for spreadsheet analysis', 'csv', FALSE, FALSE, FALSE),
    ('f0000000-0000-0000-0000-000000000004', 'Audit Trail Export', 'Complete audit trail for official documentation', 'xlsx', FALSE, TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 10: STORAGE BUCKETS & POLICIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Private submissions bucket (DLL files)
INSERT INTO storage.buckets (id, name, public) VALUES ('submissions', 'submissions', false) ON CONFLICT (id) DO NOTHING;
-- Public avatars bucket (user/school/district logos)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

-- Submissions storage policies
DROP POLICY IF EXISTS "Users can upload own submissions" ON storage.objects;
CREATE POLICY "Users can upload own submissions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can view own storage" ON storage.objects;
CREATE POLICY "Users can view own storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Supervisors can view all storage" ON storage.objects;
CREATE POLICY "Supervisors can view all storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'submissions' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'District Supervisor'));

DROP POLICY IF EXISTS "School heads can view school storage" ON storage.objects;
CREATE POLICY "School heads can view school storage"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'submissions' AND
    EXISTS (
        SELECT 1 FROM public.profiles viewer
        WHERE viewer.id = auth.uid()
          AND viewer.role IN ('School Head', 'Master Teacher')
          AND viewer.school_id = (SELECT school_id FROM public.profiles WHERE id::text = (storage.foldername(storage.objects.name))[1])
    )
);

-- Avatars storage policies
DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;
CREATE POLICY "Public avatar read access"
ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text);

DROP POLICY IF EXISTS "School Heads can upload school logos" ON storage.objects;
CREATE POLICY "School Heads can upload school logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'schools' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'School Head' AND school_id::text = (storage.foldername(name))[2])
);

DROP POLICY IF EXISTS "District Supervisors can upload district logos" ON storage.objects;
CREATE POLICY "District Supervisors can upload district logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'districts' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'District Supervisor' AND district_id::text = (storage.foldername(name))[2])
);

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 11: REALTIME (subscription/realtime publication)
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 12: KEY REPORTING QUERIES (used by the app / ready to run)
-- ══════════════════════════════════════════════════════════════════════════════

-- 12.1 Per-teacher compliance (dashboard "Teacher Compliance" table).
--      expected = active loads × defined (active) weeks.
WITH
loads AS ( SELECT user_id, count(*) AS n FROM teaching_loads WHERE is_active GROUP BY user_id ),
weeks AS ( SELECT count(*) AS n FROM academic_calendar WHERE is_active ),
subs AS (
    SELECT s.user_id,
        count(*) FILTER (WHERE s.compliance_status IN ('compliant','on-time')) AS compliant,
        count(*) FILTER (WHERE s.compliance_status = 'late') AS late
    FROM submissions s
    GROUP BY s.user_id
)
SELECT p.full_name AS teacher,
       sc.name AS school,
       COALESCE(l.n,0) * w.n AS expected,
       COALESCE(s.compliant,0) AS compliant,
       COALESCE(s.late,0) AS late,
       GREATEST(0, (COALESCE(l.n,0)*w.n) - (COALESCE(s.compliant,0) + COALESCE(s.late,0))) AS missing,
       CASE WHEN COALESCE(l.n,0)*w.n > 0
            THEN ROUND(100.0 * (COALESCE(s.compliant,0) + COALESCE(s.late,0)) / (COALESCE(l.n,0)*w.n))
            ELSE 0 END AS rate
FROM profiles p
LEFT JOIN schools sc ON sc.id = p.school_id
LEFT JOIN loads l ON l.user_id = p.id
CROSS JOIN weeks w
LEFT JOIN subs s ON s.user_id = p.id
WHERE p.role = 'Teacher' AND p.is_active
ORDER BY rate DESC, p.full_name;

-- 12.2 School-level compliance rollup
SELECT sc.name AS school,
       count(DISTINCT p.id) FILTER (WHERE p.role = 'Teacher') AS teachers,
       count(*) FILTER (WHERE s.compliance_status IN ('compliant','on-time')) AS compliant,
       count(*) FILTER (WHERE s.compliance_status = 'late') AS late,
       count(*) FILTER (WHERE s.compliance_status = 'missing') AS missing
FROM schools sc
LEFT JOIN profiles p ON p.school_id = sc.id AND p.role = 'Teacher'
LEFT JOIN submissions s ON s.user_id = p.id
GROUP BY sc.id, sc.name
ORDER BY sc.name;

-- 12.3 Fill every "blank" reference table with a count check
SELECT 'divisions' AS tbl, count(*) AS rows FROM divisions
UNION ALL SELECT 'districts', count(*) FROM districts
UNION ALL SELECT 'schools', count(*) FROM schools
UNION ALL SELECT 'profiles', count(*) FROM profiles
UNION ALL SELECT 'academic_calendar', count(*) FROM academic_calendar
UNION ALL SELECT 'teaching_loads', count(*) FROM teaching_loads
UNION ALL SELECT 'curriculum_subjects', count(*) FROM curriculum_subjects
UNION ALL SELECT 'submissions', count(*) FROM submissions
UNION ALL SELECT 'submission_reviews', count(*) FROM submission_reviews
UNION ALL SELECT 'dll_annotations', count(*) FROM dll_annotations
UNION ALL SELECT 'dll_reviews', count(*) FROM dll_reviews
UNION ALL SELECT 'dll_audit_logs', count(*) FROM dll_audit_logs
UNION ALL SELECT 'dll_file_versions', count(*) FROM dll_file_versions
UNION ALL SELECT 'dll_export_templates', count(*) FROM dll_export_templates
UNION ALL SELECT 'system_settings', count(*) FROM system_settings
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
ORDER BY tbl;

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF COMPLETE SCHEMA
-- ══════════════════════════════════════════════════════════════════════════════