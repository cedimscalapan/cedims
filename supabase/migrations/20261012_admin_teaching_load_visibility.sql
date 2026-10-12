-- Admins need to see the uploader's active teaching loads when correcting an
-- archive target. The list is still scoped in the UI to the file uploader.

DROP POLICY IF EXISTS "Admins can view district teaching loads" ON public.teaching_loads;
CREATE POLICY "Admins can view district teaching loads"
    ON public.teaching_loads FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles admin_profile
            JOIN public.profiles teacher_profile
                ON teacher_profile.id = teaching_loads.user_id
            WHERE admin_profile.id = auth.uid()
              AND admin_profile.role = 'Admin'
              AND (
                  admin_profile.district_id IS NULL
                  OR teacher_profile.district_id = admin_profile.district_id
              )
        )
    );
