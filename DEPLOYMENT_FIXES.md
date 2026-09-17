# CEDIMS Deployment Fixes & Configuration Guide

## Issue 1: CORS Errors for Backblaze B2 File Uploads

### Problem
When uploading files from the frontend to Backblaze B2, the browser blocks requests with:
```
Access to fetch at 'https://s-e-vision-submissions.s3.us-east-005.backblazeb2.com/...' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

### Root Cause
The B2 bucket (`s-e-vision-submissions`) doesn't have CORS policy configured to allow requests from your Vercel deployment domain (`https://cedims.vercel.app`).

### Solution: Configure B2 Bucket CORS Policy

1. **Log into Backblaze B2 Console**
   - Go to https://secure.backblaze.com/
   - Navigate to your bucket (`s-e-vision-submissions`)

2. **Access Bucket Settings**
   - Click on the bucket name
   - Go to "Bucket Settings" tab
   - Scroll to "CORS Rules"

3. **Add CORS Rule**
   Click "Add a CORS Rule" and configure:
   
   ```json
   {
     "corsRules": [
       {
         "allowedHeaders": ["*"],
         "allowedOperations": ["b2_download_file_by_id", "b2_get_file_info"],
         "allowedOrigins": ["https://cedims.vercel.app"],
         "exposeHeaders": ["x-bz-content-sha1", "x-bz-file-id", "x-bz-file-name", "x-bz-upload-timestamp"],
         "maxAgeSeconds": 3600
       },
       {
         "allowedHeaders": ["authorization", "content-type", "content-length", "x-bz-content-sha1", "x-bz-file-name", "x-bz-info-*"],
         "allowedOperations": ["b2_upload_file", "b2_upload_part", "b2_finish_large_file"],
         "allowedOrigins": ["https://cedims.vercel.app"],
         "exposeHeaders": ["x-bz-content-sha1", "x-bz-file-id", "x-bz-file-name", "x-bz-upload-timestamp"],
         "maxAgeSeconds": 3600
       }
     ]
   }
   ```

4. **Save Configuration**
   - Click "Save"
   - Wait 5-10 minutes for B2 to apply changes

5. **Test Upload**
   - Try uploading a file in CEDIMS
   - Check browser console for CORS errors
   - Monitor Network tab in DevTools

### Alternative: During Development (localhost)
If you're testing locally, add localhost CORS rules:
```json
{
  "allowedOrigins": ["http://localhost:5173", "http://localhost:3000", "https://cedims.vercel.app"]
}
```

---

## Issue 2: Offline Sync Queue Errors

### Problem
```
[offline] processQueue skipped: Already syncing
[sync] Failed to sync PDF: TypeError: Failed to fetch
```

### Root Cause
The offline sync queue is unable to complete sync operations because:
1. File uploads to B2 are failing (CORS error)
2. The sync process marks itself as "already syncing" to prevent duplicate attempts
3. Sync fails and never completes, locking the queue

### Solution

1. **Fix CORS First** (see Issue 1 above)
   - Once B2 CORS is configured, the sync queue will automatically resume

2. **Clear Stuck Sync State** (if needed)
   - Open browser DevTools (F12)
   - Go to "Application" tab
   - Find "IndexedDB" → "cedims"
   - Look for object stores: `syncQueue`, `submissions`, `offlineMetadata`
   - Check if there are stuck entries in `syncQueue`

3. **Manual Queue Clearing** (last resort)
   ```javascript
   // In browser console:
   if (window.indexedDB) {
     const req = indexedDB.open('cedims');
     req.onsuccess = (e) => {
       const db = e.target.result;
       const tx = db.transaction(['syncQueue'], 'readwrite');
       tx.objectStore('syncQueue').clear();
       console.log('Queue cleared');
     };
   }
   ```

4. **Monitor Sync Progress**
   - Open DevTools Console
   - Look for `[offline]` and `[sync]` log messages
   - Check the SyncStatus component in the Sidebar

---

## Issue 3: Environment Variables on Vercel

### Required Environment Variables
Ensure these are set in Vercel Project Settings → Environment Variables:

```
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_APPLICATION_KEY_ID=your_b2_app_key_id
B2_APPLICATION_KEY=your_b2_app_key
B2_BUCKET_NAME=s-e-vision-submissions
```

### How to Add to Vercel

1. Go to https://vercel.com/dashboard
2. Select your project (SmartEvision)
3. Settings → Environment Variables
4. Add each variable:
   - Name: (from list above)
   - Value: (your actual value)
   - Environments: Production, Preview, Development

5. Redeploy after adding variables:
   ```bash
   git push  # Vercel auto-deploys, or manually deploy
   ```

---

## Deployment Checklist

- [ ] B2 CORS policy configured for cedims.vercel.app
- [ ] All environment variables added to Vercel
- [ ] CEDIMSLoader redesigned for unique branding ✓
- [ ] Logo z-index and visibility fixed ✓
- [ ] Application builds without errors
- [ ] Test file upload (small PDF first)
- [ ] Test offline-to-online sync
- [ ] Test with different user roles (Teacher, School Head, District Supervisor)
- [ ] Monitor server logs for any errors

---

## Troubleshooting

### Upload Still Failing?
1. Check browser DevTools → Network tab
2. Look for requests to `presign` API and B2 upload URL
3. Check response status codes
4. Look for CORS headers in response
5. Check Vercel function logs

### Offline Sync Not Working?
1. Verify browser is actually offline (DevTools → Network tab)
2. Check IndexedDB for queued items
3. Monitor browser console for error messages
4. Try manual page refresh
5. Check SyncStatus component in Sidebar

### Server-Side Upload as Fallback
If B2 CORS cannot be configured, the application has a fallback server-side upload endpoint at `/api/storage/upload` (4.2MB limit).

To use it, modify the pipeline upload logic in `src/lib/utils/pipeline.ts` (around line 234) to use the server endpoint instead of pre-signed URLs.

---

## Support Resources

- [Backblaze B2 CORS Documentation](https://www.backblaze.com/b2/docs/b2-api.html)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [SvelteKit Deployment Guide](https://kit.svelte.dev/docs/adapter-vercel)

