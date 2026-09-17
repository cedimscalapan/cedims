# Smart E-VISION Capstone — Complete Revision Checklist
## Parts to Remove · Parts to Edit · New Content to Add

> Purpose: make every claim in the paper match the verified system. All AI/NLP/tech facts below are
> grounded in the live codebase and the actual training artifacts
> (`chatbot/results/intent_training_results.json`, `src/lib/utils/*.ts`).
>
> **Master rule:** Naive Bayes is a *reviewed* related-laboratory method only. It is **never** the
> implemented classifier. The implemented stack is:
> **rule-based regex + Dice-coefficient fuzzy matching** (OCR metadata) and
> **character n-gram multinomial Logistic Regression** (chatbot intent), **K-Means** (behavioral
> clusters), and **rule-based pattern detection** (risk alerts).

---

## PART A — CONTENT TO REMOVE (delete or rewrite)

### A1. "Naive Bayes" as an implemented system feature
Remove/rewrite every claim that the *system itself uses* Naive Bayes. These appear in:
- **Software Interface** — *"NLP Models including Naive Bayes classification and rules-based methods have been employed using Python and Scikit-learn."*
- **System Analysis and Design** — *"...Natural Language Processing (NLP) with Naive Bayes and rule-based analysis for automatic document categorization."*

Keep the Naive Bayes **references** in Chapter II (Zhang 2024; Sahoo 2022; Kaur & Singh 2020;
Naulak 2022) — but only as related literature, not as the chosen method.

### A2. Overstatement of the Copilot / assistant panel
In the Methodology/functional text, do **not** claim the full assistant suggestion panel is fully
integrated in the live UI. The shipped Upload page uses the Copilot's **auto-fill and mismatch-check**
(`predictLoad`, `validateSelection`); the full suggestion panel is not mounted. Optional trim in
**Software Interface / System Analysis** if it promises a fully displayed coaching panel.

### A3. Any claim that ML runs server-side at inference time
Remove implications that model inference happens on a server. The intent model is a **JSON file
loaded and run in the browser** (offline). Clarify that Python/Scikit-learn is **training-only**.

---

## PART B — CONTENT TO CORRECT / ENRICH IN EXISTING SECTIONS

### B1. Project Context / Introduction (strengthen "why" and ground it)
- Add one concrete sentence that the district's ~weekly manual checking of teachers' documents is
  replaced by **real-time compliance classification** (Compliant / Late / Missing / Supplementary,
  computed from upload time vs. deadline) in `src/lib/utils/useDashboardData.ts` / `offline.ts`.
- Clarify that hardware costs are lowered by **client-side OCR/NLP** (no cloud ML API fees) and by
  **Backblaze B2 object storage** — ties to the paper's "reduced operational/printing costs."

### B2. Objectives (make Objective 3 precise)
Current: *"...optical character recognition, natural language processing, and K-Means clustering to support document classification, metadata extraction, and analysis of teacher submission behavior."*
Suggested: add the two concrete mechanisms: **fuzzy/Dice matching + rule-based regex** for
metadata/classification, and **character n-gram Logistic Regression** for NLP intent classification.

### B3. Chapter II (Review of Related Literature / Synthesis)
- **Add** a short paragraph on **fuzzy string matching (Dice coefficient / edit distance)** as the
  tolerance mechanism for OCR noise (Navarro, 2001; Dice, 1945) — currently absent, but essential
  because it's a core implemented technique.
- **Add** a short paragraph on **logistic regression text classification** as the lightweight
  on-device alternative to Naive Bayes (Hastie et al., 2009), tying it to the assistant.
- **Reframe** the Naive Bayes paragraphs per Section 1/A1 above (reviewed literature only).
- **Synthesis:** replace any sentence implying "Naive Bayes" integrative implementation with the
  accurate stack.
- Consider adding one citation on **character n-gram features for typo/code-switch robustness**.

### B4. Methodology — Software Interface
Replace the software-interface AI sentence with the accurate pipeline (see
`docs/CORRECTED_AI_NLP_CLAIMS.md` section 1). Keep listings (tesseract.js, Scikit-learn, K-Means)
but clarify the training-only nature of Scikit-learn.

### B5. Methodology — System Analysis and Design
Replace the *"NLP with Naive Bayes and rule-based"* sentence with the accurate one (see corrected doc
section 2). Add the four compliance statuses and the hash-chained audit log as part of the workflow.

### B6. Functional Requirements Table — NLP-Based Classification row
Change to reflect fuzzy/rule-based + char n-gram logistic classification (corrected doc section 4).

### B7. Table 3 (Software Specifications) — Machine Learning row
Add footnote: **Python/Scikit-learn used only for training; inference runs in-browser from a JSON
model.** (corrected doc section 6).

### B8. Security Requirements
Correctly list the integrity mechanism: **SHA-256 via Web Crypto** + **hash-chained audit log**
(`src/lib/utils/audit.ts`) + **QR stamping** (`src/lib/utils/qr-stamp.ts`). This is largely correct;
ensure it also mentions the audit log and duplicate/re-upload prevention for already-approved files.

---

## PART C — NEW CONTENT TO INCLUDE

### C1. Actual ML/AI model training & evaluation results (new "Testing/AI results" subsection)
Add a dedicated results subsection, since reviewers expect evidence. Real metrics from
`intent_training_results.json`:

| Metric | Value |
|--------|-------|
| Training samples | 639 |
| Intents | 8 |
| Vocabulary (character n-grams) | 5,000 |
| Training accuracy | 100.0% |
| **Held-out test accuracy** | **91.88%** |
| **5-fold CV mean** | **95.62% ± 2.01%** |
| CV fold accuracies | 95.31 / 97.66 / 97.66 / 92.19 / 95.28 |

Per-intent F1 (test set): ask_compliance 85.71 · calendar_info 97.56 · check_deadline 91.43 ·
find_dll 90.48 · general_help 92.68 · how_to_upload 85.71 · school_compare 94.44 ·
teacher_stats 97.56.

**Suggested narrative:** 91.88% held-out and 95.62% CV (small spread ±2.01%) show the char n-gram
logistic model generalizes well and handles intentional typo/Filipino variants — justifying the
lightweight, offline choice over heavier models. This is the testing evidence supporting the method
selection.

### C2. Full AI/ML technology-to-code mapping table (new)
Add the mapping below to show reviewers each AI feature is real and traceable:

| AI/ML function | Implemented method | Code path |
|----------------|--------------------|-----------|
| OCR metadata extraction | tesseract.js + PDF.js (two-pass hybrid) | `src/lib/utils/ocr.ts` |
| Doc/field classification | Rule-based regex + Dice fuzzy matching | `src/lib/utils/fuzzyClassifier.ts` |
| Chatbot intent classification | Char n-gram multinomial Logistic Regression | `chatbot/train_intent_classifier.py`, `src/lib/utils/chatbot.ts` |
| Upload assistant (Copilot) | Rule-based + fuzzy load prediction | `src/lib/utils/copilot.ts` |
| Teacher behavior clustering | K-Means (K-Means++ seeding) | `src/lib/utils/clusterAnalytics.ts` |
| Risk/anomaly alerts | Rule-based pattern detection | `src/lib/utils/patternDetection.ts` |
| QR verification | jsQR scanning + QR stamping | `src/lib/components/QRScanner.svelte`, `qr-stamp.ts` |
| Voice guidance | Web Speech API (TTS) | `src/lib/utils/voiceGuide.ts` |

### C3. Methodology — Model development process (new subsection under Methodology or a new "Technical Development" part)
Add the 8-step pipeline (from `docs/COMPLETE_TECHNOLOGIES_AND_AI_DOCUMENTATION.md` §4):
1. Data collection — 639 labeled samples, 8 intents, with English + typo + Filipino variants.
2. Feature engineering — character n-grams, 5,000 features via CountVectorizer.
3. Model selection — multinomial Logistic Regression (lightweight, offline, interpretable).
4. Training — fitted on training split (scikit-learn).
5. Evaluation — held-out test + 5-fold stratified CV.
6. Export — serialized coefficients to `intent_classifier_model.json`.
7. Integration — in-browser inference in `chatbot.ts`.
8. Maintenance — replace JSON artifact on retrain; no cloud serving.

### C4. OCR hybrid two-pass detail (new, short)
Explain the **PDF.js embedded-text pass → tesseract.js raster fallback** strategy, plus the
**grayscale + binary thresholding** optimization for low-end mobile, plus **language detection**
(English vs. Filipino) and **week resolution from date ranges**. This strengthens the "resource-
efficient / on-device" claims central to your justification.

### C5. Method-justification table (new, anti-reviewer section)
Add a concise "Why these methods and not the alternatives" table grounded in the results:
| Alternative | Why not chosen |
|-------------|----------------|
| Deep learning (LSTM/BERT) | Too heavy to run offline in-browser; overkill for ~640 samples; 91.88% test already sufficient |
| Word-level TF-IDF SVM | Fragile to typos and code-switching |
| Word2Vec/embeddings | Large matrix, needs corpus training, no gain on small set |
| Cloud OCR / NLP APIs | Internet + cost + data-privacy concerns |
| Naive Bayes (for OCR header) | Removed in favor of Dice fuzzy matcher (no model files, instant, offline) |

### C6. Accessible/accessibility feature (new, optional)
Include the **text-to-speech voice guidance** as an accessibility feature supporting teachers with
limited digital literacy — strengthens alignment with your RRL on training/digital competence
(Alférez-Pastor et al., 2023; Pesina, 2025).

---

## PART D — REFERENCES TO ADD (match new content)
Add to the References list:
- Navarro, G. (2001). A guided tour to approximate string matching. *ACM Computing Surveys, 33*(1), 31–88.
- Dice, L. R. (1945). Measures of the amount of ecologic association between species. *Ecology, 26*(3), 297–302. [Dice coefficient origin]
- Hastie, T., Tibshirani, R., & Friedman, J. (2009). *The Elements of Statistical Learning* (2nd ed.). Springer. [Logistic regression / multinomial softmax]

*(Optional for K-Means correctness if cited already or add)* — MacQueen (1967) and Arthur &
Vassilvitskii (2007, k-means++) can be added if you mention initialization.

---

## SUMMARY PRIORITY ORDER (what to do first)
1. **A1 + B4 + B5 + B6** — remove "Naive Bayes as implemented", correct the three prose/table spots. (critical)
2. **C1** — add the real training/test/CV results (high reviewer value).
3. **C2, C4, C5** — add the code-mapping table, OCR detail, method-justification. (high value)
4. **C3** — add the model-development-process subsection.
5. **B3 + D** — enrich RRL with fuzzy/logistic paragraphs + new references.
6. **B7, C6, B8** — finishing touches.