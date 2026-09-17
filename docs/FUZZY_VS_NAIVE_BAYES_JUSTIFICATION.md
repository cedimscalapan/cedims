# 3.x Implementation Rationale: Lightweight Classifier Selection for Document Metadata Extraction

## 3.x.1 Problem Definition

The automatic classification and metadata-extraction module receives short, single-line header
fields produced by Optical Character Recognition (OCR) from instructional documents (Detailed
Lesson Plans, Instructional Supervisory Plans, and Instructional Supervisory Reports). The task is
to extract three attributes — Subject, Grade Level, and Document Type — from text that exhibits a
high incidence of character-level recognition errors (e.g., `Le@rning Ar3a` in place of
`Learning Area`). Three properties of this task drive the choice of classifier:

1. the label set is small and fixed (six grade levels, seventeen subject entries, three document
   types);
2. the inputs are short, structured strings rather than large free-text documents; and
3. inference is executed entirely on the client side, on modest school hardware, with no cloud
   machine-learning runtime.

## 3.x.2 Comparative Analysis of Candidate Approaches

Two candidate techniques were evaluated for this sub-task: a probabilistic Naive Bayes classifier
and a deterministic rule-based and fuzzy string-matching classifier.

Naive Bayes is recognized in the literature as an efficient, simple, and accurate method for the
large-scale classification of educational documents (Zhang, 2024; Sahoo et al., 2022). Its
usefulness, however, is contingent on several conditions that are not satisfied by the present
task. First, it requires a substantial labeled corpus to estimate prior and conditional
probabilities; the system is deployed without such an archive. Second, its feature-independence
assumption is violated by header fields, in which tokens such as "Grade," "4," and "Mathematics"
are highly correlated. Third, its bag-of-words representation is brittle in the presence of OCR
noise, because misspelled tokens become out-of-vocabulary features, and its Laplacian smoothing
introduces error on short inputs. Finally, a deployed Naive Bayes model imposes a model file, a
vocabulary, and an inference runtime that must be retrained whenever reference values change.

The classifier ultimately adopted is a deterministic hybrid: exact rule-based (regular-expression)
matching is applied first, and a Dice-coefficient fuzzy matcher is applied as a fallback. The
Dice coefficient computes the similarity between two strings from the overlap of their character
bigrams, as defined in Equation (3.x):

```
Dice(A, B) = 2|bigrams(A) ∩ bigrams(B)| / (|bigrams(A)| + |bigrams(B)|)
```

Because it operates at the character level rather than on exact words, it tolerates the
substitution and deletion errors characteristic of OCR output, matching noisy strings such as
`Le@rning Ar3a` to the reference value `Learning Area`. Inputs are normalized by lowercasing and
stripping non-alphanumeric characters before comparison, and a candidate is accepted only when its
score meets a predefined threshold; otherwise the attribute is deliberately left uncertain rather
than probabilistically guessed.

## 3.x.3 Selection Justification

The Dice-coefficient matcher was selected over Naive Bayes for four reasons:

1. **Training independence.** It requires no labeled corpus and produces correct results at first
   deployment, using only a hand-authored reference vocabulary of subjects, grade levels, and
   document types. New institutions or subjects can be accommodated by editing the reference list
   without any retraining pipeline.
2. **Robustness to OCR error.** Character-bigram overlap captures partially correct strings,
   whereas a probabilistic word-level model degrades on out-of-vocabulary tokens.
3. **Determinism and auditability.** Identical input yields an identical, reproducible decision
   expressed as a confidence score, or a full-confidence result from an explicit pattern match.
   This traceability is essential in a compliance-monitoring context.
4. **Minimal runtime footprint.** The implementation is a compact, dependency-free module that runs
   deterministically in the browser, consistent with the system's requirement for lightweight,
   on-device operation. Naive Bayes was therefore retained only as reviewed related literature
   (Section 2) rather than as the implemented method.

## 3.x.4 Modeled Results

The implemented fuzzy matcher is deterministic: explicit document-type and grade-level patterns
return full (100%) confidence, while ambiguous inputs are rejected below a fixed threshold,
yielding no false-positive classification. The single trained model in the system, a character
n-gram multinomial logistic regression used for the assistant's intent classification, was trained
on 639 samples across eight intents with a 5,000-character-n-gram vocabulary, attaining a
hold-out test accuracy of 91.88% and a 5-fold cross-validation mean accuracy of 95.62% ± 2.01%.
This confirms that, where a statistical model is genuinely required for a broader linguistic task,
the lightweight approach remains accurate; for the narrow header-extraction sub-task, the
deterministic fuzzy matcher is the more appropriate and more economical choice.

## 3.x.5 Implementation Mapping

| Function | Technique implemented |
|----------|------------------------|
| OCR metadata extraction | tesseract.js (client-side) |
| Subject / Grade / Document-Type classification | Rule-based regex + Dice-coefficient fuzzy matcher |
| Assistant intent classification | Character n-gram multinomial logistic regression |
| Upload assistance | Rule-based engine with fuzzy load prediction |
| Teacher behavior analysis | K-Means clustering |
| Anomaly / risk alerting | Rule-based pattern detection |