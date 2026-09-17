-- Migration: Add avatar_url to schools and districts
-- Date: 2026-03-20

-- 1. Add avatar_url columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create Storage Bucket for Avatars
-- Note: This might need to be run in the Supabase SQL Editor if service role is required, 
-- but we'll include it for completeness as part of the schema definition.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS Policies for 'avatars' bucket

-- 3a. Public Read Access (Optional, but usually avatars are public)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 3b. Users can upload their own avatars
DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = 'users' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

-- 3c. Users can update their own avatars
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = 'users' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

-- 3d. School Heads can upload school logos
DROP POLICY IF EXISTS "School Heads can upload school logos" ON storage.objects;
CREATE POLICY "School Heads can upload school logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = 'schools' AND
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'School Head' 
        AND school_id::text = (storage.foldername(name))[2]
    )
);

-- 3e. School Heads can update school logos
DROP POLICY IF EXISTS "School Heads can update school logos" ON storage.objects;
CREATE POLICY "School Heads can update school logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = 'schools' AND
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'School Head' 
        AND school_id::text = (storage.foldername(name))[2]
    )
);

-- 3f. District Supervisors can upload district logos
DROP POLICY IF EXISTS "District Supervisors can upload district logos" ON storage.objects;
CREATE POLICY "District Supervisors can upload district logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = 'districts' AND
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'District Supervisor' 
        AND district_id::text = (storage.foldername(name))[2]
    )
);

-- 3g. District Supervisors can update district logos
DROP POLICY IF EXISTS "District Supervisors can update district logos" ON storage.objects;
CREATE POLICY "District Supervisors can update district logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = 'districts' AND
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'District Supervisor' 
        AND district_id::text = (storage.foldername(name))[2]
    )
);
-- 4. Schools and Districts RLS Policies

-- 4a. Enable RLS
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

-- 4b. SELECT: Authenticated users can view all schools and districts
DROP POLICY IF EXISTS "Authenticated users can view schools" ON schools;
CREATE POLICY "Authenticated users can view schools"
ON schools FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can view districts" ON districts;
CREATE POLICY "Authenticated users can view districts"
ON districts FOR SELECT TO authenticated
USING (true);

-- 4c. UPDATE: School Heads can update their own school's avatar_url
DROP POLICY IF EXISTS "School Heads can update own school logo" ON schools;
CREATE POLICY "School Heads can update own school logo"
ON schools FOR UPDATE TO authenticated
USING (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'School Head')
)
WITH CHECK (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'School Head')
);

-- 4d. UPDATE: District Supervisors can update their own district's avatar_url
DROP POLICY IF EXISTS "District Supervisors can update own district logo" ON districts;
CREATE POLICY "District Supervisors can update own district logo"
ON districts FOR UPDATE TO authenticated
USING (
    id = (SELECT district_id FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor')
)
WITH CHECK (
    id = (SELECT district_id FROM profiles WHERE id = auth.uid() AND role = 'District Supervisor')
);
