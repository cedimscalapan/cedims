-- Original-file fingerprint is separate from the unique QR verification ID.
-- Do not backfill from file_hash: older hashes include a per-upload random nonce.
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS content_hash text;

-- Uniqueness is scoped to the uploader. Deleted rows immediately release the hash.
-- Also protects simultaneous uploads that both pass the preliminary live lookup.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_submission_content
ON public.submissions (user_id, content_hash)
WHERE content_hash IS NOT NULL;
