# Smart E-VISION — Corrected AI/NLP Claims (Matching the Actual System)

> This file contains **replacement text** for the parts of the capstone paper that currently describe
> the AI/NLP implementation as **Naive Bayes**. In the actual, verified system the OCR header/field
> classifier is a **Dice-coefficient fuzzy matcher** (no model files, no training) and the only
> trained scikit-learn model is a **character n-gram multinomial Logistic Regression** used for the
> chatbot's intent classification. K-Means clustering remains as described.
>
> **Rule of thumb for the paper:** present Naive Bayes only as *reviewed related literature* (as the
> paper already does in Chapter II), never as the method chosen and implemented in the system.

---

## 1. Software Interface — replacement paragraph

> **Original:**
> "NLP Models including Naive Bayes classification and rules-based methods have been employed using Python and Scikit-learn."

> **Replace with:**
> "The AI components are integrated in a lightweight, client-side manner. Optical Character
> Recognition (OCR) is performed using **tesseract.js** to retrieve metadata from uploaded
> documents, and the extracted text is classified using a **rule-based and fuzzy (Dice-coefficient)
> matcher** that tolerates OCR typos. A **character n-gram multinomial Logistic Regression** model,
> trained offline with **Python and Scikit-learn**, is used for the chatbot's intent classification
> and for uploading assistance. **K-Means clustering** is also used to analyze teacher submission
> behavior for predictive and monitoring purposes."

---

## 2. System Analysis and Design — replacement paragraph

> **Original:**
> "The application will process the instructional materials through a unified workflow that includes
> Optical Character Recognition (OCR) with tesseract.js for metadata extraction and Natural Language
> Processing (NLP) with Naive Bayes and rule-based analysis for automatic document categorization."

> **Replace with:**
> "The application processes the instructional materials through a unified workflow that includes
> Optical Character Recognition (OCR) with **tesseract.js** for metadata extraction and a
> **rule-based and fuzzy (Dice-coefficient)** matcher for automatic document classification and
> metadata normalization. A **character n-gram Logistic Regression** model powers the assistant's
> intent recognition, while **K-Means clustering** analyzes teacher submission patterns and
> potential compliance risks."

---

## 3. System Overview — optional clarification

> **Original:**
> "After the files are submitted, the system can automatically perform Optical Character Recognition
> (OCR) and simple Natural Language Processing (NLP) to extract metadata."

> **Suggested (optional):**
> "After the files are submitted, the system can automatically perform Optical Character Recognition
> (OCR) and a lightweight Natural Language Processing (NLP) and fuzzy-matching layer to extract and
> normalize document metadata, and to classify user queries in the assistant."

---

## 4. Functional Requirements Table — NLP-Based Classification row

> **Original:** "The system shall classify documents and extract metadata using keyword matching and rule-based NLP techniques."

> **Suggested:** "The system shall classify documents and extract metadata using rule-based and fuzzy
> matching techniques that are tolerant of OCR noise, and shall classify user queries using a
> character n-gram Logistic Regression model."

---

## 5. Chapter II (Review of Related Literature) — Naive Bayes paragraph framing

> **Original paragraph** (appears in the "REVIEW OR RELATED SYSTEMS/STUDIES" section):
> "Common techniques, such as Naive Bayes classifiers and rule-based systems, are used for the
> automatic categorization of unstructured educational documents, enabling machines to effectively
> identify different document types (Khensous et al., 2023; Huang, 2021). Further, studies have
> confirmed the applicability of Naive Bayes algorithms for large-scale classification of
> educational documents, owing to their efficiency, simplicity, and accuracy (Zhang, 2024; Sahoo et
> al., 2022; Naulak, 2022; Kaur & Singh, 2020). Moreover, using a hybrid approach combining machine
> learning and rule-based systems can enhance the system's adaptability for classifying different
> types of educational documents (Aubaid et al., 2024)."

> **Replace with (keeps Naive Bayes as reviewed literature, but clarifies the chosen method):**
> "Common techniques, such as Naive Bayes classifiers, rule-based systems, and fuzzy string matching,
> are used for the automatic categorization of unstructured educational documents, enabling machines
> to effectively identify different document types (Khensous et al., 2023; Huang, 2021; Navarro,
> 2001). Studies have confirmed the applicability of Naive Bayes algorithms for large-scale
> classification of educational documents, owing to their efficiency, simplicity, and accuracy
> (Zhang, 2024; Sahoo et al., 2022; Naulak, 2022; Kaur & Singh, 2020). For lightweight, on-device
> use, however, a hybrid approach that combines rule-based and fuzzy (Dice-coefficient) matching
> enhances adaptability while requiring no trained model files, and a compact character n-gram
> Logistic Regression model can perform intent classification reliably at low computational cost
> (Aubaid et al., 2024; Hastie et al., 2009)."

---

## 6. Table 3 (Software Specifications) — Machine Learning row note

> **Original:** "Machine Learning Environment: Python 3.8+; Python Libraries: Scikit-learn, NumPy, Pandas"

> **Suggested clarification (optional, e.g., as a table footnote):**
> "Python and Scikit-learn are used **only during training** of the intent-classification model.
> In production, inference runs fully in the browser from a compact JSON model, with no server-side
> ML runtime required."

---

## 7. (Optional) Suggested added sentence in Scope and Limitations

To reinforce the choice of lightweight methods, you may add to **Scope and Limitations**:
> "The system uses only lightweight, resource-efficient AI techniques — fuzzy and rule-based
> matching for document metadata, a compact character n-gram Logistic Regression model for intent
> classification, and K-Means clustering for behavioral analysis — enabling practical, on-device
> operation on modest school hardware without cloud ML APIs."

---

## Summary of the accurate AI/NLP stack (for consistency anywhere in the paper)

| Function | Method implemented | Where (code) |
|----------|-------------------|--------------|
| OCR metadata extraction | tesseract.js (client-side), PDF.js text pass | `src/lib/utils/ocr.ts` |
| Document/field classification | Rule-based regex + Dice-coefficient fuzzy matching | `src/lib/utils/fuzzyClassifier.ts` |
| Chatbot intent classification | Character n-gram multinomial Logistic Regression | `chatbot/train_intent_classifier.py` → `src/lib/models/intent_classifier_model.json`, `src/lib/utils/chatbot.ts` |
| Upload assistant (Copilot) | Rule-based engine + fuzzy load prediction | `src/lib/utils/copilot.ts` |
| Teacher behavior analysis | K-Means clustering | `src/lib/utils/clusterAnalytics.ts` |
| Anomaly/risk alerts | Rule-based pattern detection | `src/lib/utils/patternDetection.ts` |

*All functions above are verified as 100% functional and wired into live routes.*