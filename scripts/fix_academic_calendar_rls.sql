-- ═══════════════════════════════════════════════════════════════
-- Migration: Fix Academic Calendar RLS Policy
-- Purpose: Allow School Heads and Master Teachers to manage calendars
--          in addition to District Supervisors
-- ═══════════════════════════════════════════════════════════════

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "District supervisors can manage calendar" ON academic_calendar;

-- Create new policy that allows District Supervisors, School Heads, and Master Teachers
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
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
              AND p.role IN ('District Supervisor', 'School Head', 'Master Teacher')
              AND (
                -- District Supervisor: can manage any calendar in their district
                (p.role = 'District Supervisor' AND p.district_id = academic_calendar.district_id)
                -- School Head: can manage calendar for their school's district
                OR (p.role = 'School Head' AND p.school_id IN (
                    SELECT id FROM public.schools WHERE district_id = academic_calendar.district_id
                ))
                -- Master Teacher: can manage calendar for their school's district
                OR (p.role = 'Master Teacher' AND p.school_id IN (
                    SELECT id FROM public.schools WHERE district_id = academic_calendar.district_id
                ))
              )
        )
    );

-- Verify the policy was created
-- SELECT * FROM pg_policies WHERE tablename = 'academic_calendar' AND policyname ILIKE '%calendar%';
