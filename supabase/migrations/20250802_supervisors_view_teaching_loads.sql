-- Migration: Allow supervisors to view teaching_loads in their scope
-- Purpose: The only teaching_loads policy was "Teachers manage own loads"
--          (auth.uid() = user_id), so supervisors could NOT read other
--          teachers' loads. That made totalExpected = 0 on their dashboard,
--          which always showed Missing = 0. These policies mirror the
--          submissions scoping (School Head / Master Teacher = school,
--          District Supervisor = district).

BEGIN;

DROP POLICY IF EXISTS "Supervisors view school loads" ON teaching_loads;
CREATE POLICY "Supervisors view school loads"
    ON teaching_loads FOR SELECT
    USING (
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
    ON teaching_loads FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles viewer
            JOIN profiles owner ON owner.id = teaching_loads.user_id
            WHERE viewer.id = auth.uid()
              AND viewer.role = 'District Supervisor'
              AND viewer.district_id = owner.district_id
        )
    );

COMMIT;
