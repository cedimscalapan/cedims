// Shared between ocr.ts (loads pdf.js at OCR time) and service-worker.ts
// (precaches it so that load never depends on a live CDN fetch). Keeping
// this in one place means the two can never silently drift out of sync —
// a mismatch would mean the precached file is a version the runtime never
// actually asks for, defeating the precache entirely.
export const PDFJS_VERSION = '3.4.120';
