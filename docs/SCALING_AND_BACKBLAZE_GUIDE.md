# CEDIMS Scalability + Backblaze B2 Guide

Two parts:
- **Part A** — what I changed so the system scales on the **free** Supabase tier, and how to apply it.
- **Part B** — step-by-step to buy & integrate **Backblaze B2** for always-on file storage (the code is already B2-ready).

---

## Part A — Scaling the system (free tier)

The goal was: 200 users, ~2,000 submissions/week (~80,000 rows/year), with **no paid Supabase tier**.

### What was changed

| # | File | Change | Why it scales |
|---|------|--------|---------------|
| 1a | `src/routes/dashboard/analytics/+page.svelte` — `getWeeklyCompliance()` | Now fetches **only the last 8 active weeks'** submissions (`.in('week_number', weeks)`) instead of the whole school year | Cuts ~80,000 rows sent to ~16,000; behavior of the rendered chart is identical |
| 1b | Same file — `getSchoolComparison()` | First tries the new SQL RPC `get_analytics_comparison()`; falls back to JS if migration not applied. Also scopes JS fallback with `school_year =` current year | The DS/SH comparison now receives a **few aggregate rows**, never the full table |
| 2 | Same file — `setupRealtime()` | Realtime channel filtered to `school_year=eq.<current>` | Ignores past-year events → smaller fan-out on `submissions` INSERT |
| 3 | `src/lib/utils/useDashboardData.ts` — `markNonCompliantSubmissions()` | Bulk `insert(ncRecords)` is now **chunked into ≤900-row batches** | Supabase REST rejects >~1000 rows per request; prevents timeout/rate-limit at 40k+ missing records |

### SQL migration to apply (do this once)

Create file `supabase/migrations/20260821_analytics_aggregate_functions.sql` (already added) containing
`get_current_school_year()`, `get_analytics_comparison()`, and `get_defined_weeks_count()`.

Apply in ONE of two ways:
- **CLI:** `npx supabase db push` (must have the project linked), **or**
- **Dashboard (easier):** Supabase Dashboard → SQL Editor → paste the file contents → **Run**.

Verify it works: SQL Editor → `select * from get_analytics_comparison();` while logged in as a School
Head / District Supervisor user. Each row is one teacher/school with aggregate counts (compliant, late,
noncompliant, expected, rate). If you see rows, the app will use it automatically.

> **Rollback safety:** if the migration is NOT applied, the app silently falls back to the old JS logic
> (the RPC returns an error and the code catches it). Numbers never change — only efficiency improves.

### Expected result at scale
- Analytics page no longer ships ~80k rows per view/refresh → lower egress & faster paint.
- Realtime ignores out-of-year inserts.
- `markNonCompliant` inserts in safe batches instead of one gigantic request.

---

## Part B — Buy & integrate Backblaze B2

Your code is already B2-ready: `src/lib/utils/b2.server.ts` uses the official AWS S3 SDK against B2 and
generates **pre-signed URLs** so the browser uploads/downloads documents **directly to B2**, bypassing the
4.2 MB server proxy entirely. You only need to create the bucket, keys, and CORS rules, then set env vars.

### Step 1 — Create a Backblaze account
1. Go to **https://www.backblaze.com/cloud-storage** → **Sign Up** (create account with email, or sign in with Google).
2. Verify your email.
> New accounts get a **10 GB free allowance** for 30 days (no credit card required to start). Great for a
> soft launch / capstone demo.

### Step 2 — Create a B2 bucket
1. On the dashboard, open the **B2 Cloud Storage** page → **Buckets** → **Create a Bucket**.
2. Fill in:
   - **Bucket Name** (globally unique, e.g. `cedims-documents`)
   - **Files in Bucket are:** choose **Private** (NEVER Public — you use pre-signed URLs instead).
   - **Default Encryption:** None is fine (or SSE-B2 if you prefer).
   - **Object Lock:** keep off unless you need WORM retention.
3. **Create Bucket.** Copy the **Endpoint** shown on the bucket's appkey — it looks like
   `https://s3.us-east-005.backblazeb2.com` and MUST match the region in your code.

> ⚠️ **Region must match `b2.server.ts:12`.** The code defaults to `us-east-005`. If your bucket is a
> different region, set `B2_ENDPOINT` to the bucket's exact endpoint, or change the default in the file.

### Step 3 — Create an Application Key (NOT your master key)
1. **Account → App Keys → Add a New Application Key.**
2. Set:
   - **Name of Key:** `cedims-prod`
   - **Allow Access to Bucket(s):** select only your bucket (e.g. `cedims-documents`).
   - **Type of Access:** **Read and Write** (the app must read back documents).
3. **Create Key.** Backblaze shows the **key** **once**. Write these down:
   - `keyID` = **B2_APPLICATION_KEY_ID**
   - `applicationKey` = **B2_APPLICATION_KEY**
4. This restricted key is what goes in `b2.server.ts` — never paste your master key into the app.

### Step 4 — Add CORS rules to the bucket  (critical — required for browser direct upload)
Direct browser uploads fail without CORS. On the **bucket page** → **Bucket Settings** → scroll to:
**CORS Rules** → **Edit** and (re)create a rule, or paste via **JSON**:

```json
{
  "CorsRules": [
    {
      "AllowedOrigins": ["https://your-domain.vercel.app", "http://localhost:5173"],
      "AllowedOperations": ["s3_get", "s3_put"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

- Replace `https://your-domain.vercel.app` with your real deployed origin (and add any preview branches you use).
- `s3_get` = downloads, `s3_put` = uploads (both are used by the pre-signed flow).
- **Save.** Allow a minute for CORS to propagate; hard-refresh the browser after.

### Step 5 — Set environment variables
Set these on **Vercel → Project → Settings → Environment Variables** (and in your local `.env`), matching
`.env.example`:

```
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=

B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com   # your bucket's endpoint
B2_BUCKET_NAME=cedims-documents
B2_APPLICATION_KEY_ID=<keyID you copied>
B2_APPLICATION_KEY=<applicationKey you copied>

SUPABASE_SERVICE_ROLE_KEY=...
```

Then **Redeploy** the Vercel project so the new env vars take effect.

### Step 6 — Verify end-to-end
1. Open the app → Upload a document.
2. DevTools → Network: you should see the browser `PUT` a file **directly to
   `s3.us-east-005.backblazeb2.com`** (a `200`), not to the server /upload proxy.
3. Backblaze Dashboard → B2 → Buckets → your bucket: the file should now appear.

If `PUT` fails with a **CORS** error, re-check Step 4 (origin spelling) and that you hard-refreshed.

---

### Cost expectations & how to keep it free/cheap
- Storage is billed ~**$6/TB/month** (the first ~10 GB may be covered by a trial allowance).
- **Egress:** Backblaze offers **free egress up to ~3× your stored volume** per month; direct browser
  pre-signed transfers also avoid the big server-proxy egress. With ~2000 docs/week this stays very small.
- **Budget tip:** the biggest cost lever is *not* storage but egress. Using the existing pre-signed, direct
  browser transfer (not the 4.2 MB proxy path) is what keeps egress near zero. Always keep the direct path
  for the offline-sync upload flow.

> Always confirm current pricing on https://www.backblaze.com/cloud-storage/pricing before committing —
> prices and free-tier allowances can change.