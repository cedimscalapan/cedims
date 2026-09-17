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
- `PUBLIC_GOOGLE_SCRIPT_URL`: Optional. Google Apps Script `/exec` URL for Word->PDF conversion fallback (deploy `google_apps_script.js`).

### Build Command
```bash
npm run build
# The adapter-auto will automatically detect Vercel/Netlify environments.
```

### PWA Readiness
- Manifest: `/static/manifest.json`
- Service Worker: `/src/service-worker.ts`
- Ensure HTTPS is forced on the production domain for PWA features (Camera, Cache API) to function.

