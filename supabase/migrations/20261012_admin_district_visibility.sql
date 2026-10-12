-- Admins with a district assignment can view that district's submissions.
-- Admin accounts intentionally do not need a school_id.

DROP POLICY IF EXISTS "Admins can view district submissions" ON public.submissions;
CREATE POLICY "Admins can view district submissions"
    ON public.submissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles viewer
            JOIN public.profiles uploader ON uploader.id = submissions.user_id
            WHERE viewer.id = auth.uid()
              AND viewer.role = 'Admin'
              AND (
                  viewer.district_id IS NULL
                  OR uploader.district_id = viewer.district_id
              )
        )
    );

DROP POLICY IF EXISTS "Admins can view district profiles" ON public.profiles;
CREATE POLICY "Admins can view district profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles viewer
            WHERE viewer.id = auth.uid()
              AND viewer.role = 'Admin'
              AND (
                  viewer.district_id IS NULL
                  OR profiles.district_id = viewer.district_id
              )
        )
    );
