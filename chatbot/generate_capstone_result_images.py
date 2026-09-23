"""
Generate capstone-ready chatbot result images from the trained CEDIMS intent model.

Outputs are designed for insertion into documentation chapters, presentations,
and panel defense materials.
"""

import json
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RESULTS_FILE = ROOT / "chatbot" / "results" / "intent_training_results.json"
MODEL_FILE = ROOT / "src" / "lib" / "models" / "intent_classifier_model.json"
OUTPUT_DIR = ROOT / "docs" / "images" / "chatbot"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

INTENT_DISTRIBUTION = {
    "general_help": 1745,
    "find_dll": 886,
    "ask_compliance": 879,
    "teacher_stats": 795,
    "check_deadline": 631,
    "how_to_upload": 626,
    "school_compare": 622,
    "create_report": 363,
    "calendar_info": 239,
}

DISPLAY_NAMES = {
    "ask_compliance": "Compliance Questions",
    "calendar_info": "Calendar Info",
    "check_deadline": "Deadline Checks",
    "create_report": "Report Requests",
    "find_dll": "Document Search",
    "general_help": "General Help",
    "how_to_upload": "Upload Guidance",
    "school_compare": "School Comparison",
    "teacher_stats": "Teacher Statistics",
}

BLUE = "#2444b8"
GREEN = "#16a34a"
AMBER = "#d97706"
INK = "#0f172a"
MUTED = "#64748b"
GRID = "#e2e8f0"
BG = "#f8fafc"


def load_data():
    results = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
    model = json.loads(MODEL_FILE.read_text(encoding="utf-8"))
    return results, model["training_metrics"]


def save(fig, filename):
    path = OUTPUT_DIR / filename
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(path)


def add_title(fig, title, subtitle):
    fig.text(0.04, 0.94, title, fontsize=24, fontweight="bold", color=INK)
    fig.text(0.04, 0.895, subtitle, fontsize=12.5, color=MUTED)


def performance_summary(results):
    fig = plt.figure(figsize=(13, 7.3), facecolor="white")
    add_title(
        fig,
        "CEDIMS Chatbot Intent Classifier Results",
        "Training output generated from the expanded CEDIMS chatbot dataset.",
    )

    cards = [
        ("Training Samples", f"{results['n_samples']:,}", "Role-based, bilingual, typo-aware examples"),
        ("Intent Classes", str(len(results["intents"])), "Core chatbot task categories"),
        ("Vocabulary Size", f"{results['vocabulary_size']:,}", "Character n-gram features"),
        ("Test Accuracy", f"{results['test_accuracy']:.2f}%", "Held-out evaluation set"),
        ("5-Fold CV", f"{results['cv_mean']:.2f}%", f"± {results['cv_std']:.2f}% stability"),
        ("Selected Model", "C = 0.5", "Logistic Regression classifier"),
    ]

    for i, (label, value, note) in enumerate(cards):
        row, col = divmod(i, 3)
        x = 0.04 + col * 0.31
        y = 0.66 - row * 0.25
        rect = plt.Rectangle((x, y), 0.28, 0.18, transform=fig.transFigure, facecolor=BG, edgecolor=GRID, linewidth=1.2)
        fig.patches.append(rect)
        fig.text(x + 0.025, y + 0.105, value, fontsize=24, fontweight="bold", color=BLUE)
        fig.text(x + 0.025, y + 0.067, label, fontsize=12.5, fontweight="bold", color=INK)
        fig.text(x + 0.025, y + 0.032, note, fontsize=10.5, color=MUTED)

    ax = fig.add_axes([0.08, 0.08, 0.84, 0.2])
    folds = results["cv_folds"]
    x = np.arange(1, len(folds) + 1)
    ax.plot(x, folds, marker="o", color=BLUE, linewidth=2.5)
    ax.fill_between(x, [min(folds) - 0.15] * len(folds), folds, color=BLUE, alpha=0.08)
    ax.set_title("Cross-Validation Fold Accuracy", loc="left", fontsize=13, fontweight="bold", color=INK)
    ax.set_xlabel("Fold")
    ax.set_ylabel("Accuracy (%)")
    ax.set_ylim(min(folds) - 0.4, max(folds) + 0.4)
    ax.grid(True, axis="y", color=GRID)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for i, score in zip(x, folds):
        ax.text(i, score + 0.05, f"{score:.2f}%", ha="center", fontsize=9.5, color=INK)

    save(fig, "chatbot_model_performance_summary.png")


def intent_distribution():
    fig, ax = plt.subplots(figsize=(12, 7), facecolor="white")
    names = [DISPLAY_NAMES[k] for k in INTENT_DISTRIBUTION.keys()]
    values = list(INTENT_DISTRIBUTION.values())
    y = np.arange(len(names))
    bars = ax.barh(y, values, color=BLUE, alpha=0.9)
    ax.set_yticks(y, names)
    ax.invert_yaxis()
    ax.set_title("Expanded Chatbot Dataset Distribution", loc="left", fontsize=22, fontweight="bold", color=INK, pad=20)
    ax.text(0, -1.05, "6,786 total labeled samples across 9 intents", fontsize=12.5, color=MUTED)
    ax.set_xlabel("Training Samples")
    ax.grid(True, axis="x", color=GRID)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for bar, value in zip(bars, values):
        ax.text(value + 25, bar.get_y() + bar.get_height() / 2, f"{value:,}", va="center", fontsize=10.5, color=INK)
    fig.tight_layout(pad=2.2)
    save(fig, "chatbot_intent_dataset_distribution.png")


def per_intent_metrics(training_metrics):
    per_intent = training_metrics["per_intent"]
    names = [DISPLAY_NAMES[k] for k in per_intent.keys()]
    precision = [per_intent[k]["precision"] for k in per_intent.keys()]
    recall = [per_intent[k]["recall"] for k in per_intent.keys()]
    f1 = [per_intent[k]["f1_score"] for k in per_intent.keys()]

    x = np.arange(len(names))
    width = 0.25
    fig, ax = plt.subplots(figsize=(14, 7.5), facecolor="white")
    ax.bar(x - width, precision, width, label="Precision", color=BLUE)
    ax.bar(x, recall, width, label="Recall", color=GREEN)
    ax.bar(x + width, f1, width, label="F1-score", color=AMBER)
    ax.set_ylim(90, 101)
    ax.set_title("Per-Intent Classification Performance", loc="left", fontsize=22, fontweight="bold", color=INK, pad=20)
    ax.text(-0.5, 101.2, "Scores show how accurately the chatbot identifies each CEDIMS user request type.", fontsize=12.5, color=MUTED)
    ax.set_ylabel("Score (%)")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=35, ha="right")
    ax.grid(True, axis="y", color=GRID)
    ax.legend(loc="lower right", frameon=False)
    for spine in ax.spines.values():
        spine.set_visible(False)
    fig.tight_layout(pad=2.2)
    save(fig, "chatbot_per_intent_precision_recall_f1.png")


def coverage_summary():
    fig = plt.figure(figsize=(13, 7.2), facecolor="white")
    add_title(
        fig,
        "CEDIMS Chatbot Knowledge Coverage",
        "Major dataset areas added to make the assistant wider, smarter, and more system-specific.",
    )

    areas = [
        ("Upload Pipeline", "Validation, DOC/DOCX to PDF, OCR, metadata, SHA-256, duplicate check, B2 upload, QR verification, offline sync"),
        ("Role Workflows", "Teacher, Master Teacher, School Head, District Supervisor, and Admin tasks"),
        ("Compliance Monitoring", "Compliant, missing, late, for checking, checked, teacher list, school summary, district summary"),
        ("Archives and Reviews", "Search, pagination, document view, remarks, download, share, verification, checker name"),
        ("AI and ML Features", "Intent classifier, fuzzy classifier, OCR-assisted extraction, and K-Means compliance grouping"),
        ("Troubleshooting", "Pre-signed URL errors, file size, conversion failure, unsupported type, metadata mismatch, sync retry"),
    ]

    for i, (title, body) in enumerate(areas):
        row, col = divmod(i, 2)
        x = 0.04 + col * 0.46
        y = 0.68 - row * 0.19
        rect = plt.Rectangle((x, y), 0.42, 0.135, transform=fig.transFigure, facecolor=BG, edgecolor=GRID, linewidth=1.2)
        fig.patches.append(rect)
        fig.text(x + 0.022, y + 0.086, title, fontsize=14, fontweight="bold", color=BLUE)
        fig.text(x + 0.022, y + 0.036, body, fontsize=9.5, color=INK, wrap=True)

    fig.text(0.04, 0.06, "Result: The chatbot can classify user intent and then answer using CEDIMS-specific knowledge and live role-scoped system data where available.", fontsize=12, color=MUTED)
    save(fig, "chatbot_dataset_knowledge_coverage.png")


def main():
    results, training_metrics = load_data()
    performance_summary(results)
    intent_distribution()
    per_intent_metrics(training_metrics)
    coverage_summary()


if __name__ == "__main__":
    main()
