BEGIN;
CREATE OR REPLACE FUNCTION public.can_access_document_review(p_submission uuid, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM submissions s JOIN profiles owner ON owner.id=s.user_id JOIN profiles viewer ON viewer.id=auth.uid()
  WHERE s.id=p_submission AND viewer.is_active IS DISTINCT FROM false AND (
    (NOT p_write AND s.user_id=auth.uid()) OR
    (s.user_id<>auth.uid() AND (
      (viewer.role IN ('Master Teacher','School Head') AND viewer.school_id=owner.school_id AND
        (s.doc_type IN ('DLL','DLP') OR (viewer.role='School Head' AND owner.role='Master Teacher' AND s.doc_type IN ('ISP','ISR')))) OR
      (viewer.role='District Supervisor' AND viewer.district_id=owner.district_id) OR
      (NOT p_write AND viewer.role='Admin')
    ))
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_access_document_review(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_document_review(uuid,boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS public.document_review_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
 reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
 reviewer_name text NOT NULL,
 reviewer_role text NOT NULL,
 status text NOT NULL CHECK(status IN ('checked','needs-revision')),
 comment text NOT NULL DEFAULT '' CHECK(length(comment)<=5000),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'needs-revision' OR length(trim(comment))>0)
);
CREATE INDEX IF NOT EXISTS document_review_entries_lookup ON public.document_review_entries(submission_id,reviewer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS document_review_latest ON public.document_review_entries(submission_id,created_at DESC,id DESC);
ALTER TABLE public.document_review_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scoped_review_read ON public.document_review_entries;
CREATE POLICY scoped_review_read ON public.document_review_entries FOR SELECT TO authenticated
USING(public.can_access_document_review(submission_id,false));
GRANT SELECT ON public.document_review_entries TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.document_review_entries FROM authenticated;

-- Preserve existing remarks as the first recorded review, without changing the originals.
INSERT INTO public.document_review_entries(id,submission_id,reviewer_id,reviewer_name,reviewer_role,status,comment,created_at)
 SELECT r.id,r.submission_id,r.reviewer_id,coalesce(p.full_name,'Reviewer'),p.role,
 CASE WHEN r.status='returned' THEN 'needs-revision' ELSE 'checked' END,
 left(coalesce(nullif(trim(r.reviewer_comment),''),r.return_reason,''),5000),coalesce(r.updated_at,r.created_at,now())
 FROM public.dll_reviews r JOIN public.profiles p ON p.id=r.reviewer_id
 WHERE nullif(trim(coalesce(r.reviewer_comment,r.return_reason)), '') IS NOT NULL
 ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE VIEW public.document_review_current WITH (security_invoker=true) AS
 SELECT DISTINCT ON(submission_id) * FROM public.document_review_entries
 ORDER BY submission_id,created_at DESC,id DESC;
GRANT SELECT ON public.document_review_current TO authenticated;

CREATE OR REPLACE FUNCTION public.get_document_reviews(p_submission uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_access_document_review(p_submission,false) THEN RAISE EXCEPTION 'You cannot view this document.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'can_review',public.can_access_document_review(p_submission,true),
  'current',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.document_review_current r WHERE submission_id=p_submission),'[]'::jsonb),
  'history',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY created_at DESC,id DESC) FROM
     (SELECT * FROM public.document_review_entries WHERE submission_id=p_submission ORDER BY created_at DESC,id DESC LIMIT 100) r),'[]'::jsonb)
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_document_review(p_submission uuid,p_status text,p_comment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reviewer public.profiles%ROWTYPE; owner_id uuid; review_comment text; legacy_status text;
BEGIN
 IF NOT public.can_access_document_review(p_submission,true) THEN RAISE EXCEPTION 'You cannot review this document.' USING ERRCODE='42501'; END IF;
 review_comment:=trim(coalesce(p_comment,''));
 IF p_status IS DISTINCT FROM 'checked' OR length(review_comment)>5000 THEN
   RAISE EXCEPTION 'Documents can be marked Checked only. Revision and resubmission are not required.' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_submission::text));
 IF EXISTS(SELECT 1 FROM document_review_current WHERE submission_id=p_submission AND status=p_status AND comment=review_comment) THEN
   RETURN public.get_document_reviews(p_submission);
 END IF;
 SELECT * INTO reviewer FROM profiles WHERE id=auth.uid();
 INSERT INTO document_review_entries(submission_id,reviewer_id,reviewer_name,reviewer_role,status,comment,created_at)
 VALUES(p_submission,auth.uid(),coalesce(reviewer.full_name,'Reviewer'),reviewer.role,p_status,review_comment,clock_timestamp());
 -- One shared review per document. Entries above retain prior edit versions.
 legacy_status:='approved';
 INSERT INTO dll_reviews(submission_id,reviewer_id,status,reviewer_comment,return_reason)
 VALUES(p_submission,auth.uid(),legacy_status,coalesce(nullif(review_comment,''),'Checked'),CASE WHEN legacy_status='returned' THEN review_comment ELSE NULL END)
 ON CONFLICT(submission_id) DO UPDATE SET reviewer_id=excluded.reviewer_id,status=excluded.status,reviewer_comment=excluded.reviewer_comment,return_reason=excluded.return_reason,updated_at=now();
 SELECT user_id INTO owner_id FROM submissions WHERE id=p_submission;
 INSERT INTO notifications(user_id,title,message,type,link)
 VALUES(owner_id,'Document checked',coalesce(reviewer.full_name,'A reviewer')||' checked your document. Any remarks are guidance for future lesson plans; no revision or resubmission is required.',
 'success','/dashboard/archive?review='||p_submission::text);
 RETURN public.get_document_reviews(p_submission);
END;
$$;
REVOKE ALL ON FUNCTION public.get_document_reviews(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_document_review(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_document_reviews(uuid),public.save_document_review(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
