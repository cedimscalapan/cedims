-- The live calendar numbers weeks within each term. Preserve its six Term 2
-- weeks and all linked submissions; add the missing slots as unpublished drafts.
-- Drafts do not enter upload, notifications, or compliance until opened.
BEGIN;

ALTER TABLE public.academic_calendar
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
DECLARE
    calendar_scope record;
    term_no integer;
    first_deadline timestamptz;
    slot_count integer;
BEGIN
    FOR calendar_scope IN
        SELECT id AS district_id FROM public.districts
    LOOP
        IF EXISTS (
            SELECT 1 FROM public.academic_calendar
            WHERE district_id = calendar_scope.district_id
              AND school_year = '2026-2027'
              AND week_number NOT BETWEEN 1 AND 14
        ) THEN
            RAISE EXCEPTION 'District % has calendar weeks outside 1–14; review before expanding', calendar_scope.district_id;
        END IF;

        FOR term_no IN 1..3 LOOP
            -- Existing dates supply the term's weekly starting point. Empty
            -- terms use provisional dates; all inserted slots remain drafts.
            SELECT min(deadline_date - (week_number - 1) * interval '7 days')
            INTO first_deadline
            FROM public.academic_calendar
            WHERE district_id = calendar_scope.district_id
              AND school_year = '2026-2027'
              AND term = term_no;

            first_deadline := coalesce(first_deadline, CASE term_no
                WHEN 1 THEN timestamptz '2026-06-12 10:00:00+08'
                WHEN 2 THEN timestamptz '2026-09-14 10:00:00+08'
                ELSE timestamptz '2027-01-08 10:00:00+08'
            END);

            INSERT INTO public.academic_calendar
                (district_id, school_year, term, week_number, deadline_date,
                 description, is_active, is_published)
            SELECT calendar_scope.district_id, '2026-2027', term_no, slot.week_number,
                   first_deadline + (slot.week_number - 1) * interval '7 days',
                   'Week ' || slot.week_number || ' — Review deadline before opening',
                   FALSE, FALSE
            FROM generate_series(1, 14) AS slot(week_number)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.academic_calendar existing
                WHERE existing.district_id = calendar_scope.district_id
                  AND existing.school_year = '2026-2027'
                  AND existing.term = term_no
                  AND existing.week_number = slot.week_number
            );

            SELECT count(*) INTO slot_count
            FROM public.academic_calendar
            WHERE district_id = calendar_scope.district_id
              AND school_year = '2026-2027'
              AND term = term_no;
            IF slot_count <> 14 THEN
                RAISE EXCEPTION 'District %, term % has % weeks rather than 14',
                    calendar_scope.district_id, term_no, slot_count;
            END IF;
        END LOOP;
    END LOOP;
END $$;

COMMIT;
