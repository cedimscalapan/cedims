-- Production-safe duplicate upload fix.
-- Earlier databases may have a unique constraint/index on submissions.file_hash
-- with a generated or legacy name. Drop every unique object that includes only
-- file_hash so identical PDF contents can be archived multiple times.

DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'submissions'
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname::text ORDER BY a.attnum)
              FROM unnest(c.conkey) AS key(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
          ) = ARRAY['file_hash']
    LOOP
        EXECUTE format('ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;
END $$;

DO $$
DECLARE
    index_name text;
BEGIN
    FOR index_name IN
        SELECT i.relname
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'submissions'
          AND x.indisunique
          AND (
              SELECT array_agg(a.attname::text ORDER BY a.attnum)
              FROM unnest(x.indkey) AS key(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
          ) = ARRAY['file_hash']
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', index_name);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_submissions_file_hash
ON public.submissions(file_hash);
