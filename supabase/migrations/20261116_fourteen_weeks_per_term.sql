-- Expand an existing complete 13-week-per-term calendar to 14 weeks per term.
-- Keep calendar IDs, deadlines, active states, and linked history intact.
-- New weeks start Closed; an administrator must review their provisional dates.
-- The migration stops instead of guessing how to remap a partial/custom calendar.
BEGIN;

DO $$
DECLARE
    calendar_scope record;
    old_week integer;
    new_week integer;
    calendar_row_id uuid;
    current_term integer;
    term_one_count integer;
    term_two_count integer;
    term_three_count integer;
BEGIN
    FOR calendar_scope IN
        SELECT DISTINCT district_id, school_year
        FROM public.academic_calendar
        WHERE district_id IS NOT NULL AND school_year IN ('2026-2027', '2027-2028')
    LOOP
        SELECT
            count(*) FILTER (WHERE term = 1),
            count(*) FILTER (WHERE term = 2),
            count(*) FILTER (WHERE term = 3)
        INTO term_one_count, term_two_count, term_three_count
        FROM public.academic_calendar
        WHERE district_id = calendar_scope.district_id
          AND school_year = calendar_scope.school_year;

        IF term_one_count = 14 AND term_two_count = 14 AND term_three_count = 14
           AND NOT EXISTS (
               SELECT 1 FROM public.academic_calendar
               WHERE district_id = calendar_scope.district_id
                 AND school_year = calendar_scope.school_year
                 AND week_number NOT BETWEEN (term - 1) * 14 + 1 AND term * 14
           ) THEN
            CONTINUE;
        END IF;

        IF term_one_count <> 13 OR term_two_count <> 13 OR term_three_count <> 13
           OR EXISTS (
               SELECT 1 FROM public.academic_calendar
               WHERE district_id = calendar_scope.district_id
                 AND school_year = calendar_scope.school_year
                 AND week_number NOT BETWEEN (term - 1) * 13 + 1 AND term * 13
           ) THEN
            RAISE EXCEPTION 'Calendar for district % and school year % is not the standard 13-week layout; review it before expanding',
                calendar_scope.district_id, calendar_scope.school_year;
        END IF;

        -- Move later weeks from highest to lowest so unique week keys never collide.
        FOR old_week IN SELECT generate_series(39, 14, -1) LOOP
            current_term := CASE WHEN old_week >= 27 THEN 3 ELSE 2 END;
            new_week := old_week + CASE WHEN current_term = 3 THEN 2 ELSE 1 END;

            SELECT id INTO STRICT calendar_row_id
            FROM public.academic_calendar
            WHERE district_id = calendar_scope.district_id
              AND school_year = calendar_scope.school_year
              AND term = current_term
              AND week_number = old_week;

            UPDATE public.submissions
            SET week_number = new_week
            WHERE calendar_id = calendar_row_id;

            -- Some older uploads have no calendar_id. Their old global week range
            -- and term still identify the same period within the user's district.
            UPDATE public.submissions s
            SET week_number = new_week
            FROM public.profiles p
            WHERE s.user_id = p.id
              AND s.calendar_id IS NULL
              AND p.district_id = calendar_scope.district_id
              AND s.school_year = calendar_scope.school_year
              AND s.week_number = old_week
              AND (s.term_number = current_term OR s.term_number IS NULL);

            IF to_regclass('public.submission_leave_requests') IS NOT NULL THEN
                UPDATE public.submission_leave_requests leave_request
                SET week_number = new_week
                FROM public.profiles p
                WHERE leave_request.user_id = p.id
                  AND p.district_id = calendar_scope.district_id
                  AND leave_request.school_year = calendar_scope.school_year
                  AND leave_request.term_number = current_term
                  AND leave_request.week_number = old_week;
            END IF;

            UPDATE public.academic_calendar
            SET week_number = new_week,
                description = regexp_replace(description, '^(Term [123] )?Week [0-9]+', '\1Week ' || new_week)
            WHERE id = calendar_row_id;
        END LOOP;

        INSERT INTO public.academic_calendar
            (district_id, school_year, term, week_number, deadline_date, description, is_active)
        SELECT district_id, school_year, term, term * 14,
               ((deadline_date AT TIME ZONE 'Asia/Manila')::date + 7 + time '10:00') AT TIME ZONE 'Asia/Manila',
               'Week ' || (term * 14) || ' — Review deadline before opening', FALSE
        FROM public.academic_calendar
        WHERE district_id = calendar_scope.district_id
          AND school_year = calendar_scope.school_year
          AND (term, week_number) IN ((1, 13), (2, 27), (3, 41));
    END LOOP;
END $$;

COMMIT;
