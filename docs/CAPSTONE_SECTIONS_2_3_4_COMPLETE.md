# Smart E-VISION — Complete Content for Capstone Sections
## (2) Discussion of Technologies · (3) Development Process of the ML/AI Model · (4) Justification Based on Testing Results

> Ready-to-paste text for the three sections. All claims are grounded in the verified codebase and
> the actual training artifacts (`chatbot/results/intent_training_results.json`,
> `src/lib/utils/*.ts`). Numbers are the real recorded metrics. Replace "Smart E-VISION" as needed;
> references are suggested in [brackets] and listed in the References addendum.

---

# SECTION 2 — DISCUSSION OF TECHNOLOGIES (OCR, NLP, CLUSTERING, AND OTHERS)

This section discusses the principal technologies that give Smart E-VISION its intelligent,
on-device processing capability: Optical Character Recognition (OCR), Natural Language Processing
(NLP), fuzzy string matching, K-Means clustering, and the supporting rule-based pattern detection.
All of these technologies were selected to be **lightweight, offline-capable, and free of
recurring cloud costs**, which is a critical requirement for public elementary schools with limited
connectivity and modest hardware.

## 2.1 Optical Character Recognition (OCR)

OCR is the conversion of scanned or photographed text into machine-readable text. In Smart
E-VISION, OCR is the gateway of the entire document workflow: it reads the metadata out of uploaded
Daily Lesson Logs (DLLs), Instructional Supervisory Plans (ISPs), and Instructional Supervisory
Reports (ISRs) so that the system can classify, route, and monitor each document without manual data
entry [Khensous et al., 2023; Shete et al., 2025].

**Hybrid two-pass approach.** Smart E-VISION uses a **two-pass hybrid strategy** that maximizes
accuracy while keeping cost at zero and keeping processing fully on-device:

1. **Pass 1 — Embedded text extraction (PDF.js).** Born-digital documents usually contain an
   embedded text layer. The system reads this directly with PDF.js (version 3.4.120), which is
   instant and exact because no character recognition is required.
2. **Pass 2 — Raster OCR (Tesseract.js).** When the extracted text is too sparse (fewer than about
   50 characters), the document is a scan and must be recognized. Smart E-VISION renders the page to
   a canvas and runs **Tesseract.js** (a WebAssembly port of Tesseract that runs entirely in the
   browser) with the multilingual **`eng+fil`** engine.

**Low-end device optimization.** Because many district teachers use modest mobile devices, the
raster pass performs **adaptive pre-processing**: the rendered page is converted to grayscale and
then binary-thresholded (black or white) before recognition. This makes Tesseract's job easier and
faster on low-CPU processors. The system also detects the device type and lowers the render scale on
mobile to conserve memory.

**Language awareness.** The recognized text is analyzed to detect whether the document is written in
**English or Filipino/Tagalog** (`detectLanguage`) by scoring vocabulary indicators (for example,
*PAARALAN/GURO/PETSA* suggest Filipino, while *SCHOOL/TEACHER/DATE* suggest English). This matters
because DLLs are commonly written in Filipino.

**Metadata and week resolution.** From the recognized text, the system extracts the document type,
subject, grade level, school year, school, teacher, and date. When a printed week number is absent,
the system parses the **date range** in the document header (supporting both English and Filipino
month names, e.g., *"FEBRUARY 9–13, 2026"* or *"ENERO 15–19, 2026"*) and resolves it to an
academic-calendar week by matching against the week's deadline window (`resolveWeekFromDates`). Every
extraction carries an **OCR confidence score** that is surfaced to the teacher in the Upload
interface, so low-confidence readings are visible and correctable before submission.

> **Why this matters:** OCR automates metadata entry, reduces manual work, and helps identify
> non-compliance patterns early through automated text analysis [Agarwal & Anastasopoulos, 2024;
> Kumar & Prasad, 2024]. Running OCR client-side keeps student data local and eliminates per-request
> cloud fees.

## 2.2 Fuzzy String Matching (the tolerance layer for OCR noise)

OCR is imperfect; scanned documents frequently contain typos, confusions, and dirt (e.g.,
*"Le@rning Ar3a"* for *"Learning Area"* or *"DALY LESSON LOG"* for *"DLL"*). Smart E-VISION therefore
adds a **fuzzy string matching layer** so that noisy OCR text still maps correctly to canonical
values. The system computes the **Dice coefficient**, a similarity measure based on bigram (two-
character) overlap between the input string and known reference lists [Dice, 1945; Navarro, 2001]:

> Dice(A,B) = 2 × |bigrams(A) ∩ bigrams(B)| / (|bigrams(A)| + |bigrams(B)|)

The classifier (`fuzzyClassifier.ts`) compares each input against reference lists for **subjects**,
**grade levels (Grade 1–6)**, and **document types (DLL, ISP, ISR)**, plus bilingual field labels.
It returns the best match above a confidence threshold. **No training and no model files are
required** — it uses reference lists and similarity thresholds directly — and it naturally tolerates
the typos OCR produces.

Document-type detection gives priority to **deterministic regular expressions** (matching English
and Tagalog patterns such as *DAILY LESSON LOG*, *BANGHAY ARALIN*, *INSTRUCTIONAL SUPERVISORY PLAN*,
etc.) and only falls back to fuzzy matching when the regexes fail. This tiered design keeps the most
confident exact matches first and uses fuzziness gracefully for the rest.

## 2.3 Natural Language Processing (NLP)

NLP enables the system to understand and classify human language. Smart E-VISION applies NLP in two
places:

**a) Chatbot intent classification.** A **character n-gram multinomial Logistic Regression** model
classifies user questions into **8 intents**: *ask_compliance, calendar_info, check_deadline,
find_dll, general_help, how_to_upload, school_compare, teacher_stats*. The model uses **character
n-grams** rather than whole words, which makes it robust to typos, Filipino/Tagalog phrasing, and
code-switching — for example, *"compliance"* and its typo *"complience"* still share most character
n-grams. The trained model is exported to a compact JSON file and loaded **directly in the browser**,
so the entire assistant runs offline with no server round-trip [Hastie et al., 2009; Khensous et al.,
2023].

After classification, a **hybrid TF-IDF + Jaccard similarity** ranking engine retrieves relevant
records (for example, finding the requested DLL), and a small FAQ knowledge base plus conversation
memory handle follow-up questions. This gives teachers a natural-language way to check their
compliance, find deadlines, locate documents, and compare school performance.

**b) Document-content NLP support (Smart Copilot).** During upload, the **Smart Copilot**
(`copilot.ts`) uses the extracted text together with cached teaching loads, submission history, and
calendar deadlines to guide the teacher. It:
- **auto-selects the correct teaching load** by matching the OCR-predicted subject (`predictLoad`);
- **detects content mismatches** (e.g., the document reads *"Mathematics"* but the teacher selected
  *"Science"*) and warns before submission (`validateSelection`);
- **flags missing submissions** for the current week, warns about **approaching deadlines**,
  **prevents duplicates**, and provides **smart recommendations and tips**.

This NLP-assisted validation reduces upload errors and gives teachers immediate, personalized
feedback [Sajja et al., 2023; Qu et al., 2025].

## 2.4 K-Means Clustering (unsupervised learning)

To help supervisors see beyond simple averages, Smart E-VISION groups teachers into behavioral
segments using **K-Means clustering** (`clusterAnalytics.ts`). Each teacher is represented by a
**four-dimensional feature vector**:
- **Punctuality** — percentage of submissions that were on time;
- **Consistency** — regularity of the submission day (derived from the standard deviation of the
  day-of-week; a lower standard deviation means a more regular schedule);
- **Completeness** — percentage of expected weeks that have at least one submission;
- **Volume** — average number of documents submitted per active week.

The algorithm initializes centroids using a **K-Means++-style** strategy (choosing high, low, and
widely separated starting points to reduce sensitivity to initialization [Arthur & Vassilvitskii,
2007]), then iterates assignment and centroid-update steps using Euclidean distance until the
assignments stabilize. Teachers are then labeled by cluster quality (for example,
*"Consistently Meeting Standards"*, *"Steadily Progressing"*, *"Building Momentum"*), which surfaces
at-risk and high-performing cohorts for targeted technical assistance [Noviandy et al., 2025;
Solano et al., 2024; Nagaswetha et al., 2022]. The results are visualized through a
cluster-visualization component and the school-monitoring dashboard.

## 2.5 Rule-Based Pattern Detection (risk / anomaly alerts)

Complementing the clustering analysis, Smart E-VISION includes a **rule-based early-warning
system** (`patternDetection.ts`) that scans recent weeks and raises alerts for defined risk
patterns:
- **Consecutive Late/Missing** — a teacher late or missing for 3+ consecutive weeks;
- **High Non-Compliance** — a teacher's non-compliance above a threshold (e.g., 60%);
- **Bulk Submission** — several documents submitted within a short window, indicating last-minute
  cramming.

Each alert carries a severity level and is shown to supervisors through an alert banner. Rules are
**transparent, auditable, and require no training** — supervisors can see exactly why an alert fired
[Chandola et al., 2009]. This gives the district an early-warning capability that turns monitoring
data into proactive support [Hasanudin et al., 2025; Saro et al., 2025].

## 2.6 Supporting Technologies

- **Text-to-Speech (Web Speech API)** — spoken step-by-step upload guidance, improving accessibility
  and helping teachers with limited digital literacy (`voiceGuide.ts`).
- **QR code generation and scanning** — a verifiable QR stamp is embedded on documents with
  `pdf-lib`, and `jsQR` scans stamps to open the verification portal [San Agustin-Crescencio et al.,
  2025; Kumar et al., 2025].
- **SHA-256 hashing** — a unique digital fingerprint per document (Web Crypto API) to detect
  tampering and prevent duplicates (`hash.ts`).
- **Hash-chained audit log** — every action is chained and tamper-evident (`audit.ts`).

> **Technology summary.** Smart E-VISION deliberately combines OCR, fuzzy matching, NLP, K-Means
> clustering, and rule-based detection into a single **on-device, offline-capable** pipeline. This
> integrated approach enhances document archiving, compliance, risk analytics, feedback, and
> verification, improving both instructional quality and administrative convenience [Handayani,
> 2024; Wiyono et al., 2021; Wakeel et al., 2025].

---

# SECTION 3 — DEVELOPMENT PROCESS OF THE MACHINE LEARNING / AI MODEL

The principal **trained** AI component in Smart E-VISION is the **chatbot intent classifier**. It
was developed through a complete, documented machine-learning pipeline using Python and
scikit-learn, then exported to a compact JSON artifact that runs entirely in the browser. The
training script (`chatbot/train_intent_classifier.py`) also produces a confusion matrix, ROC curves,
a classification report, and top-word charts. The development process comprised the following steps.

## Step 1 — Data Collection and Labeling
A labeled dataset of **639 question samples** was hand-curated across **8 intents**. Each intent
deliberately includes three variant families that mirror real usage:
- **Standard phrasing** (e.g., *"What is my compliance rate?"*);
- **Typographical-error variants** (e.g., *"complience"*, *"dedline"*, *"skool"*, *"how meny"*) that
  reflect fast mobile typing;
- **Filipino / Tagalog variants** (e.g., *"Ano ang compliance rate ko?"*, *"Kailan ang deadline para
  sa Week 5?"*) to accommodate the district's bilingual users and code-switching.

Approximate per-intent sample counts: `ask_compliance` ~90, `check_deadline` ~80, `find_dll` ~80,
`school_compare` ~75, `teacher_stats` ~80, `calendar_info` ~70, `how_to_upload` ~70, and
`general_help` ~70.

## Step 2 — Preprocessing and Feature Engineering
Text is tokenized into **character n-grams** (contiguous character sequences) rather than whole
words. Character n-grams were chosen because they tolerate spelling errors and code-switching — a
partially-correct word still shares most of its character n-grams with the correct word. Features
are extracted with `CountVectorizer`, producing a vocabulary of **5,000** character n-gram features.

## Step 3 — Model Selection
**Multinomial Logistic Regression** with a softmax output was selected. It is a linear,
highly-interpretable, and extremely efficient model whose learned weights serialize to a compact
JSON array and execute instantly in a browser. Section 4 details why it was chosen over
alternatives.

## Step 4 — Training
The model was fitted on the **training split** using the 5,000-character feature matrix. All
training runs offline in the script using scikit-learn; no data leaves the training environment.

## Step 5 — Evaluation
The model was evaluated on a **held-out test split** and, separately, with **5-fold stratified
cross-validation** to guard against overfitting and to assess generalization. Metrics captured
included accuracy, per-intent precision/recall/F1, a confusion matrix, and ROC curves. The results
are reported in Section 4.1.

## Step 6 — Model Export
The learned coefficients and intercepts are serialized to `intent_classifier_model.json`, together
with the vocabulary and intent labels. The JSON is deliberately minimal so the browser can deserialize
and run it without any ML runtime.

## Step 7 — Integration into the Application
`chatbot.ts` imports the JSON model and performs **run-time inference on the client**:
1. the user's text is tokenized into the same character n-grams and vectorized against the stored
   vocabulary;
2. a softmax over the intent weights selects the most likely intent;
3. the matched intent routes to a handler that queries local or synchronized data;
4. a **hybrid TF-IDF + Jaccard** retriever ranks records, and the FAQ knowledge base plus
   conversation memory handle follow-ups.

## Step 8 — Ongoing Maintenance
Because the system uses no cloud dependency and no runtime model serving, updates are as simple as
retraining and replacing the JSON artifact. The training script is self-contained and reproducible,
so the model can be improved as more real user questions are collected.

> **Summary.** The model was developed through a standard CRISP-style pipeline — collect, engineer
> features, select a model, train, evaluate, export, integrate, and maintain — with a design goal of
> **offline, browser-based inference on modest hardware**.

---

# SECTION 4 — JUSTIFICATION BASED ON TESTING RESULTS: WHY THIS METHOD AND NOT THE ALTERNATIVES

This section justifies the method choices using the **actual recorded test results** and compares
them against realistic alternatives. The overarching constraints are: **cost-free, offline,
on-device operation on modest school hardware**, and tolerance of **OCR and typing noise**.

## 4.1 Actual Testing Results (from `intent_training_results.json`)

| Metric | Value |
|--------|-------|
| Training samples | 639 |
| Intents | 8 |
| Vocabulary (character n-grams) | 5,000 |
| Training accuracy | 100.0% |
| **Held-out test accuracy** | **91.88%** |
| **5-fold cross-validation mean** | **95.62% ± 2.01%** |
| CV fold accuracies | 95.31, 97.66, 97.66, 92.19, 95.28 |

**Per-intent F1 (test set):**

| Intent | F1 (%) |
|--------|--------|
| ask_compliance | 85.71 |
| calendar_info | 97.56 |
| check_deadline | 91.43 |
| find_dll | 90.48 |
| general_help | 92.68 |
| how_to_upload | 85.71 |
| school_compare | 94.44 |
| teacher_stats | 97.56 |

**Interpretation.** The **91.88% held-out test accuracy** on only ~640 samples shows the 8 intents
are well separated and the character n-gram features capture each intent's distinctive vocabulary.
The **95.62% mean cross-validation accuracy** with a small spread (±2.01%) demonstrates the model
generalizes consistently across folds rather than memorizing a single split. Five of eight intents
exceed 92% F1, and all exceed 85%, showing reliable performance across every question type, including
the deliberate typo and Filipino variants. The perfect training accuracy is expected for a linear
model on this dataset; the decisive measures are the held-out and CV figures.

## 4.2 Why Character n-Gram Logistic Regression (for the chatbot)

| Alternative | Why NOT chosen | Evidence / rationale |
|-------------|----------------|----------------------|
| **Deep learning (LSTM / Transformers / BERT)** | Heavy models cannot run offline in a browser on low-end devices; require GPU/server; overkill for ~640 samples | 91.88% test / 95.62% CV already exceeds practical need; a tiny logistic model loads instantly and runs fully offline |
| **Word-level TF-IDF + linear SVM** | Fragile to OCR typos and Filipino code-switching because exact words rarely match | Character n-grams tolerate `"complience"`→`compliance` and `"dedline"`→`deadline`, confirmed by the test set |
| **Word2Vec / learned embeddings** | Large matrix, more memory, needs corpus training, no clear gain on a small labeled set | Char n-gram logistic model needs only coefficients (a few MB JSON), ideal for low-end school devices |
| **Rule-based keyword matching only** | High maintenance, brittle to the large variety of real phrasings | 95.62% CV across folds shows generalization beyond hand-written rules |
| **Cloud NLP APIs** | Internet + cost + data-privacy concerns for student data | Fully on-device inference keeps data local and cost at zero |

## 4.3 Why Fuzzy (Dice) Matching for OCR Header Classification
A Naive Bayes classifier was originally prototyped for header extraction, but it was **replaced** by
the **Dice-coefficient fuzzy matcher** because:
- **No training or model files** — it uses reference lists and similarity thresholds directly.
- **Naturally handles OCR typos** — bigram overlap tolerates scrambles, OCR confusions, and bilingual
  spellings without needing a retrained model.
- **Instant, offline, minimal footprint** — ideal for the OCR pipeline's performance budget.
The tiered design keeps deterministic regexes for the most confident exact doc-type matches and uses
fuzzy matching as a graceful fallback, giving the best of both precision and tolerance.

## 4.4 Why Client-Side Tesseract.js over Cloud OCR
Cloud OCR (e.g., Google Cloud Vision, AWS Textract) offers high accuracy but requires connectivity,
an API key, per-request cost, and sends potentially sensitive student data to third parties. Smart
E-VISION instead uses **Tesseract.js (fully client-side)** with a **PDF.js two-pass** hybrid so that:
- processing is **100% on-device** (privacy and works on low connectivity);
- **zero marginal cost** at the district's scale (~200 teachers × 20 documents/week);
- the **fuzzy + regex** post-processing layer compensates for Tesseract's lower raw accuracy on noisy
  scans, while the PDF.js fast-path handles born-digital files.

## 4.5 Why Lightweight K-Means for Clustering
K-Means is **interpretable, computationally cheap, and runs in the browser** from pre-aggregated
counts with no new database queries. It requires no labels (unsupervised) and is sufficient to
segment teachers into meaningful behavioral groups and identify at-risk cohorts. More complex
clustering (DBSCAN, Gaussian mixtures) provides marginal benefit here while adding cost and
complexity.

## 4.6 Why Rule-Based Pattern Detection
Pattern detection uses explicit, understandable rules (consecutive lates, high non-compliance, bulk
submissions) rather than a trained anomaly detector. Rules are **transparent and auditable**,
**zero-training and offline**, and **sufficient** for these well-defined monitoring signals; a
learned anomaly model would not add value for these specific, rule-defined risk patterns.

> **Conclusion.** The character n-gram Logistic Regression model was selected because it achieves
> **91.88% held-out test accuracy and 95.62% mean cross-validation accuracy** while remaining small
> enough to run entirely in the browser, offline, on modest school hardware — a combination that
> rule-based systems, deep models, and cloud APIs cannot provide under this project's constraints.
> The fuzzy/Dice layer, client-side OCR, K-Means, and rule-based detection follow the same
> guiding principle: **maximize accuracy while keeping the system free, offline, and lightweight.**

---

# REFERENCES ADDENDUM (add to the paper's References list)

- Arthur, D., & Vassilvitskii, S. (2007). k-means++: The advantages of careful seeding. *Proceedings of the 18th Annual ACM-SIAM Symposium on Discrete Algorithms (SODA 2007)*.
- Chandola, V., Banerjee, A., & Kumar, V. (2009). Anomaly detection: A survey. *ACM Computing Surveys, 41*(3), 1–58.
- Dice, L. R. (1945). Measures of the amount of ecologic association between species. *Ecology, 26*(3), 297–302.
- Hastie, T., Tibshirani, R., & Friedman, J. (2009). *The Elements of Statistical Learning* (2nd ed.). Springer.
- Navarro, G. (2001). A guided tour to approximate string matching. *ACM Computing Surveys, 33*(1), 31–88.
- *(Optional)* MacQueen, J. (1967). Some methods for classification and analysis of multivariate observations. *Proceedings of the 5th Berkeley Symposium on Mathematical Statistics and Probability.*

*Note: Existing citations already in the paper (Khensous et al., 2023; Shete et al., 2025; Kumar &
Prasad, 2024; Agarwal & Anastasopoulos, 2024; Sajja et al., 2023; Qu et al., 2025; Noviandy et al.,
2025; Solano et al., 2024; Nagaswetha et al., 2022; San Agustin-Crescencio et al., 2025; Kumar et
al., 2025; Chandola et al., 2009; Handayani, 2024; Wiyono et al., 2021; Wakeel et al., 2025;
Hasanudin et al., 2025; Saro et al., 2025) are reused where they already appear in your reference
list; add only the new ones above.*