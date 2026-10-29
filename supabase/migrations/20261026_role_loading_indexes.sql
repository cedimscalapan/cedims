-- Run without a transaction: concurrent creation keeps live writes available.
-- Match the role/year filters used by Tracker, Archives and Compliance.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_school_role
ON public.profiles (school_id, role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_user_year_created
ON public.submissions (user_id, school_year, created_at DESC, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_year_created
ON public.submissions (school_year, created_at DESC, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_year_user_id
ON public.submissions (school_year, user_id, id);
ANALYZE public.profiles;
ANALYZE public.submissions;
