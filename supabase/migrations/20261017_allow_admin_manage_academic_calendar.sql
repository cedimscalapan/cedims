-- The Admin UI is the authority for opening/closing calendar periods and
-- saving their deadlines. The original calendar policy omitted the dedicated
-- Admin role, so authenticated Admin writes failed RLS checks.
DROP POLICY IF EXISTS "District supervisors can manage calendar" ON public.academic_calendar;
DROP POLICY IF EXISTS "Admins and district staff can manage calendar" ON public.academic_calendar;

CREATE POLICY "Admins and district staff can manage calendar"
    ON public.academic_calendar FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles actor
            WHERE actor.id = auth.uid()
              AND (
                  (actor.role = 'Admin' AND (actor.district_id IS NULL OR actor.district_id = academic_calendar.district_id))
                  OR (actor.role = 'District Supervisor' AND actor.district_id = academic_calendar.district_id)
                  OR (actor.role IN ('School Head', 'Master Teacher') AND actor.school_id IN (
                      SELECT s.id
                      FROM public.schools s
                      WHERE s.district_id = academic_calendar.district_id
                  ))
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles actor
            WHERE actor.id = auth.uid()
              AND (
                  (actor.role = 'Admin' AND (actor.district_id IS NULL OR actor.district_id = academic_calendar.district_id))
                  OR (actor.role = 'District Supervisor' AND actor.district_id = academic_calendar.district_id)
                  OR (actor.role IN ('School Head', 'Master Teacher') AND actor.school_id IN (
                      SELECT s.id
                      FROM public.schools s
                      WHERE s.district_id = academic_calendar.district_id
                  ))
              )
        )
    );
