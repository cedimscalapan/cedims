# Smart E-VISION: Technical Documentation
**Educational Supervision & Archiving System**

## 1. System Architecture
Smart E-VISION is built on a modern **SvelteKit** frontend with a **Supabase** backend, utilizing an **Offline-First** architecture.

### core Stack
- **Frontend**: SvelteKit 5 (Runes), TailwindCSS
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime)
- **Local Storage**: IndexedDB (via idb-keyval)
- **Processing**: Tesseract.js (OCR), pdf-lib (QR Stamping), browser-image-compression

## 2. Database Schema
The system uses 9 core tables with strict RLS (Row Level Security) policies.

| Table | Description |
|-------|-------------|
| `profiles` | User profiles with role-based access levels (Teacher, Supervisor, etc.) |
| `submissions` | Central archive for all uploaded documents with SHA-256 hashes. |
| `schools` | Institutional data linked to districts. |
| `districts` | Regional organization layer for supervisors. |
| `academic_calendar` | Managed deadlines and academic weeks. |
| `teaching_loads` | Assignment tracking for teachers (Subject + Grade). |
| `submission_reviews` | Verification and audit logs for file status. |
| `audit_logs` | Secure, hash-chained log for system integrity. |
| `system_settings` | Global configuration parameters for admins. |

... (Previous sections 3-4 continue)

## 5. Production Deployment (WBS 22.3)
Smart E-VISION is optimized for **Vercel** or **Cloudflare Pages**.

### Environment Variables (.env)
See `.env.example` for the full list. Required:
- `PUBLIC_SUPABASE_URL`: Your Supabase Project URL.
- `PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon Public Key.
- `B2_ENDPOINT`, `B2_BUCKET_NAME`, `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`: Backblaze B2 Cloud Storage.
- `SUPABASE_SERVICE_ROLE_KEY`: Service-role key (admin operations, bypassing RLS). Get it from Supabase Dashboard > Project Settings > API.
- `GOOGLE_SCRIPT_URL`: Optional server-only Google Apps Script `/exec` URL for Word-to-PDF conversion. Deploy `scripts/google_apps_script.js` as a new web app and disable the old public deployment.
- `GOOGLE_SCRIPT_SHARED_SECRET`: Random server-only value that must match the Apps Script `CEDIMS_SHARED_SECRET` Script Property. The conversion endpoint falls back to text extraction when either value is missing.

To retire an exposed Apps Script URL, deploy the updated script as a **new** web
app, set `CEDIMS_SHARED_SECRET` in its Script Properties, and put the new URL
and matching secret in the server's `.env.production`. Remove
`PUBLIC_GOOGLE_SCRIPT_URL` and any `PUBLIC_HF_API_TOKEN` from that file, then
rebuild and restart the app. Disable the old Apps Script web app deployment;
removing its URL from the page alone does not revoke it. Check the live page
source and network requests to confirm the old URL is absent. The Supabase
anon key remains visible by design; verify Row Level Security policies for
`anon` and `authenticated` rather than treating that key as a password.

### Build Command
```bash
npm run build
# The adapter-auto will automatically detect Vercel/Netlify environments.
```

### PWA Readiness
- Manifest: `/static/manifest.json`
- Service Worker: `/src/service-worker.ts`
- Ensure HTTPS is forced on the production domain for PWA features (Camera, Cache API) to function.

