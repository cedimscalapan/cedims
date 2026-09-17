# Smart E-VISION (CEDIMS) — Complete Technology, AI, and ML Inventory with RRL Guide

> Companion document to `SmartEvision_Capstone_AI_OCR_NLP_Section.md`.
> This inventory lists **every AI / ML and supporting technology that is actually wired
> into the live application** (verified against real imports in `src/routes`), confirms its
> functional status, and gives each one a capstone **Related Literature (RRL)** anchor with
> suggested citations. Only technologies confirmed as 100% functional and needed are included —
> unused or removed code (e.g. the deleted Naive Bayes training notebook) is excluded.

---

## Legend

- **✅ On** — imported and invoked from a live route/component.
- **RRL needed** — should have a dedicated Related Literature section.
- File paths are relative to `src/`.

---

## A. AI / ML Modules (RRL required for each)

### A1. OCR — Hybrid Two-Pass Extraction (Tesseract.js + PDF.js)
- **Implementation:** `lib/utils/ocr.ts`
- **Libraries:** `tesseract.js` v7 (WASM, client-side), PDF.js `3.4.120` (loaded from cdnjs, `lib/utils/pdf.worker.ts`)
- **Live entry point:** `routes/dashboard/upload/+page.svelte` (`extractMetadata`)
- **Status:** ✅ On
- **What it does:** Pass 1 extracts the embedded PDF text layer via PDF.js (fast, exact for born-digital DLL/ISP/ISR). Pass 2 falls back to Tesseract.js raster OCR over the rendered first page when text is too sparse (scanned). Outputs `DocMetadata` (docType, weekNumber, schoolYear, subject, gradeLevel, rawText, confidence, language, school, teacher, dateRange).
- **RRL anchor:** Optical Character Recognition; client-side OCR; document text extraction. Cite Tesseract / Tesseract.js (Smith, 2007; Othman et al.), PDF.js (Mozilla), and OCR accuracy studies for scanned teaching documents.

### A2. Fuzzy Text Classifier (Dice Coefficient + Levenshtein)
- **Implementation:** `lib/utils/fuzzyClassifier.ts`
- **Live entry point:** used by `ocr.ts` and `copilot.ts` (→ upload flow)
- **Status:** ✅ On
- **What it does:** Maps OCR-noisy strings to canonical references (`SUBJECTS`, `GRADE_LEVELS`, `DOC_TYPES = ['DLL','ISP','ISR']`) using bigram Dice similarity and edit distance. No training or model files; robust to typos such as `"Le@rning Ar3a"` → `"Learning Area"` and `"DALY LESSON LOG"` → `"DLL"`.
- **RRL anchor:** Fuzzy string matching; Dice coefficient; edit distance; approximate string matching in data-entry validation (Navarro, 2001; Greenacre, 2016).

### A3. NLP Intent Classifier — Char n-Gram Logistic Regression (Chatbot)
- **Implementation:** `lib/utils/chatbot.ts` + `lib/models/intent_classifier_model.json`
- **Training:** `chatbot/train_intent_classifier.py`; metrics in `chatbot/results/intent_training_results.json`
- **Live entry point:** `lib/components/ChatBot.svelte` (`processQuery`, `loadDllDocumentsFromSupabase`)
- **Status:** ✅ On
- **What it does:** Classifies user questions into 8 intents (`ask_compliance`, `calendar_info`, `check_deadline`, `find_dll`, `general_help`, `how_to_upload`, `school_compare`, `teacher_stats`) using character n-gram features and a multinomial softmax. Runs fully offline from a plain-JSON model. **639 samples**, char-n-gram vocabulary 5,000; **91.88% held-out test, 95.62% ± 2.01% 5-fold CV**.
- **RRL anchor:** Natural Language Processing; intent classification; text classification; character n-grams; logistic regression; low-resource/offline NLP chatbots.

### A4. Upload Copilot — Load Prediction ML + Mismatch Check
- **Implementation:** `lib/utils/copilot.ts` + `lib/models/copilot_model.json`
- **Live entry point:** `routes/dashboard/upload/+page.svelte` (`predictLoad`, `validateSelection`)
- **Status:** ✅ On (auto-fill + mismatch-check active; full suggestion panel not mounted in current UI — note this in the paper)
- **What it does:** After OCR, auto-fills subject/week number/teaching load and flags content mismatches (e.g. doc reads "Mathematics" but selected load is "Science") before submission, reducing upload errors.
- **RRL anchor:** Intelligent document assistants / copilots; form auto-fill; ML-assisted data validation; usability of auto-form-fill.

### A5. K-Means Clustering (Unsupervised)
- **Implementation:** `lib/utils/clusterAnalytics.ts`
- **Live entry point:** `routes/dashboard/analytics/+page.svelte`, `routes/dashboard/monitoring/school/+page.svelte` (`extractFeatures`, `runKMeansClustering`, `canCluster`)
- **Visualized:** `lib/components/ClusterVisualization.svelte`
- **Status:** ✅ On
- **What it does:** Groups teachers into behavioral clusters by **punctuality (%)**, **consistency (day-of-week regularity)**, **completeness (week coverage)**, **volume (docs/week)**, using K-Means with K-Means++-style initialization and Euclidean distance. Labels clusters by centroid quality (e.g. "Consistently Meeting Standards") to surface at-risk teachers/schools.
- **RRL anchor:** Unsupervised machine learning; K-Means clustering; teacher performance profiling; educational data mining.

### A6. Pattern / Anomaly Detection (Rule-Based)
- **Implementation:** `lib/utils/patternDetection.ts`
- **Live entry point:** `routes/dashboard/+page.svelte` (`detectPatterns`), surfaced via `lib/components/AlertBanner.svelte`
- **Status:** ✅ On
- **What it does:** Detects risk patterns over recent weeks (default last 5): `consecutive_late_missing` (3+ weeks), `high_non_compliance` (>60%), `bulk_submission` (3+ in 10 min), each tagged with severity (high/medium/low).
- **RRL anchor:** Anomaly detection in educational monitoring; rule-based alerting systems; early-warning indicators for student/teacher compliance.

### A7. QR Code Scanning (Computer-Vision Adjacent, on-device)
- **Implementation:** `lib/components/QRScanner.svelte` (uses `jsqr` v1.4)
- **Live entry point:** global `routes/+layout.svelte`, `routes/verify/[hash]/+page.svelte`
- **Status:** ✅ On
- **What it does:** Scans the QR stamp on printed DLL/ISP/ISR to jump to `/verify/[hash]` for authenticity and audit-trail confirmation.
- **RRL anchor:** QR-code-based document verification; mobile scanning; integrity verification of printed records.

### A8. Text-to-Speech Voice Guidance (Web Speech API)
- **Implementation:** `lib/utils/voiceGuide.ts`
- **Live entry point:** `upload/+page.svelte`, `settings/+page.svelte` (toggle is voice-enabled), top-level app badge
- **Status:** ✅ On
- **What it does:** Spoken step-by-step guidance during upload and a voice-enable toggle, improving accessibility and guiding teachers with limited digital literacy.
- **RRL anchor:** Text-to-speech; Web Speech API; accessibility and usability in educational software; voice-assisted interfaces.

---

## B. NLP-Adjacent (RRL recommended)

### B1. Hybrid TF-IDF + Jaccard Search Ranking (Chatbot)
- **Implementation:** `lib/utils/chatbot.ts`
- **Status:** ✅ On
- **What it does:** After intent routing, ranks DLL/records results using a hybrid TF-IDF vector + Jaccard set-overlap similarity, with conversation memory for follow-ups.
- **RRL anchor:** Information retrieval; TF-IDF weighting; Jaccard similarity; search ranking; FAQ/knowledge-base retrieval.

---

## C. Supporting / Functional Technologies (needed; tech-literature RRL optional)

| Tech | Implementation | Purpose | Status |
|------|----------------|---------|--------|
| **SHA-256 file hashing** | `lib/utils/hash.ts` | tamper-evident identity, duplicate detection, offline ledger | ✅ On |
| **Hash-chained audit log** | `lib/utils/audit.ts` (`logAudit`) | chained, tamper-evident action history | ✅ On |
| **Compliance status engine** | `lib/utils/offline.ts` (`calculateComplianceStatus`), `lib/utils/useDashboardData.ts` (`calculateCompliance`, `markNonCompliantSubmissions`), `pipeline.ts` | `Compliant / Late / Missing / Supplementary` classification | ✅ On |
| **QR stamp generation** | `lib/utils/qr-stamp.ts` (`generateQrPng`, `stampQrCode`) with `qrcode` + `pdf-lib` | prints verifiable QR watermark on PDFs | ✅ On |
| **B2 / S3 pre-signed object storage** | `routes/api/storage/presign/+server.ts`, `lib/utils/b2.server.ts` (AWS SDK S3) | scalable file storage, direct upload to Backblaze B2 | ✅ On |
| **PDF/Office conversion + compression** | `lib/utils/transcode.ts`, `compress.ts`, `googleConvert.ts` (`pdf-lib`, `mammoth`, `browser-image-compression`) | normalize uploads; help keep files under the 4.2 MB proxy cap | ✅ On |
| **Offline-first PWA** | `lib/utils/offline.ts`, `offlineSubmissionLedger.ts`, `lib/components/SyncStatus.svelte` (IndexedDB via `idb-keyval`) | queue submissions offline, sync on reconnect | ✅ On |
| **Push notifications** | `lib/utils/notificationSystem.ts`, `deadlineNotifier.ts`, `lib/stores/notifications.ts` | deadline + status alerts (browser + Supabase `notifications`) | ✅ On |
| **Excel reporting** | `lib/utils/excelExport.ts` (`exceljs`) | styled XLSX export in Archive/Analytics | ✅ On |
| **Analytics charts** | `lib/components/ComplianceTrendChart.svelte`, `ComplianceHeatmap.svelte` (`chart.js`) | compliance trend + heatmap | ✅ On |
| **Web Share API** | `lib/utils/shareIntegration.ts` (`shareVerification`) | share verification links | ✅ On |
| **Badge / install prompt** | `lib/utils/badge.ts`, `lib/components/InstallPrompt.svelte` | PWA install + notification badge | ✅ On |
| **Backend** | Supabase (Postgres + Row-Level Security) | auth, DB, storage buckets, realtime | ✅ On |
| **Frontend stack** | SvelteKit 2 + Vite 7 + Tailwind 4, `lucide-svelte` icons | app shell | ✅ On |

---

## Suggested RRL citation anchors

- **OCR / Tesseract.js:** R. Smith, "An Overview of the Tesseract OCR Engine," *Proc. ICDAR*, 2007. S. Othman et al., "OCR Performance on Low-Quality Scanned Documents," *International Journal of Computer Applications*.
- **PDF.js:** Mozilla, "PDF.js — A General-Purpose, Web Standards-Based Platform for Parsing and Rendering PDFs."
- **Fuzzy matching:** G. Navarro, "A Guided Tour to Approximate String Matching," *ACM Computing Surveys*, 2001.
- **Text / intent classification:** Y. Zhang, B. Wallace, "A Sensitivity Analysis of (and Practitioners' Guide to) Convolutional Neural Networks for Sentence Classification," 2016; char-n-gram NFKC/BoW baselines in classical IR literature.
- **Logistic regression / multinomial softmax:** T. Hastie, R. Tibshirani, J. Friedman, *The Elements of Statistical Learning*, 2009.
- **K-Means:** McQueen, "Some Methods for Classification and Analysis of Multivariate Observations," 1967; Arthur & Vassilvitskii, "k-means++: The Advantages of Careful Seeding," 2007.
- **Anomaly detection:** Chandola et al., "Anomaly Detection: A Survey," *ACM Computing Surveys*, 2009.
- **Educational data mining:** Romero & Ventura, "Educational Data Mining: A Review of the State of the Art," *IEEE Trans. SMC-C*, 2010.
- **Data integrity / hashing:** Standard NIST FIPS 180-4 (SHA-2 / SHA-256).
- **QR verification:** Denso Wave QR Code spec; survey on QR-code authentication systems.
- **TTS / accessibility:** Web Speech API W3C draft; accessibility in EdTech literature.

---

## Notes for the capstone paper
1. **Do NOT cite the deleted Naive Bayes training notebook** as the production classifier. The live production classifiers are the **fuzzy/Dice** matcher (no model files) and the **char n-gram Logistic Regression** intent/copilot model (actual JSON model files).
2. **Copilot:** state that auto-fill and mismatch-check are live; the full suggestion panel is not mounted — avoid overstating.
3. **Numbers to reuse:** 639 samples, 8 intents, 5,000-char-n-gram vocabulary, **91.88% test** / **95.62% ± 2.01%** 5-fold CV; OCR confidence shown in the Upload UI; compliance statuses `Compliant / Late / Missing / Supplementary`.