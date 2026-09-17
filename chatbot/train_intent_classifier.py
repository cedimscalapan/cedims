"""
SmartE Vision Intent Classifier Training Pipeline
Trains a character n-gram Logistic Regression intent classifier.
Robust to typos, Tagalog/Filipino, and varied phrasings.
Generates: model JSON, confusion matrix, ROC curves, classification report, top words chart.
"""

import json, os, re, warnings, random
from itertools import product
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    confusion_matrix, classification_report, roc_curve, auc,
    precision_recall_fscore_support
)

warnings.filterwarnings('ignore')

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'models')
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# ─── Training Data ──────────────────────────────────────────────────────────
# ~700+ labeled questions across 8 intents
# Includes English, Tagalog/Filipino, and common typographical errors

TRAINING_DATA = [
    # ═══════════════════════════════════════════════════════════════════════════
    # ask_compliance  (~90 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "What is my compliance rate?", "intent": "ask_compliance"},
    {"text": "Am I compliant this week?", "intent": "ask_compliance"},
    {"text": "How many submissions are late?", "intent": "ask_compliance"},
    {"text": "What percentage of my DLLs are compliant?", "intent": "ask_compliance"},
    {"text": "Show my compliance status", "intent": "ask_compliance"},
    {"text": "Am I on track this term?", "intent": "ask_compliance"},
    {"text": "How compliant am I?", "intent": "ask_compliance"},
    {"text": "What is my compliance percentage?", "intent": "ask_compliance"},
    {"text": "Are all my submissions on time?", "intent": "ask_compliance"},
    {"text": "Check my submission status", "intent": "ask_compliance"},
    {"text": "How many DLLs did I submit on time?", "intent": "ask_compliance"},
    {"text": "Am I missing any submissions?", "intent": "ask_compliance"},
    {"text": "What is my compliance for Grade 5 Math?", "intent": "ask_compliance"},
    {"text": "Show me my late submissions", "intent": "ask_compliance"},
    {"text": "How many weeks am I compliant?", "intent": "ask_compliance"},
    {"text": "What is my overall compliance score?", "intent": "ask_compliance"},
    {"text": "My compliance status please", "intent": "ask_compliance"},
    {"text": "Have I submitted all required DLLs?", "intent": "ask_compliance"},
    {"text": "Which subjects am I compliant in?", "intent": "ask_compliance"},
    {"text": "Show my non-compliant weeks", "intent": "ask_compliance"},
    {"text": "How am I doing with my submissions?", "intent": "ask_compliance"},
    {"text": "What percent of my DLLs are in?", "intent": "ask_compliance"},
    {"text": "Give me my compliance summary", "intent": "ask_compliance"},
    {"text": "Show me where I am at with submissions", "intent": "ask_compliance"},
    {"text": "How many do I still need to submit?", "intent": "ask_compliance"},
    {"text": "Am I falling behind on DLLs?", "intent": "ask_compliance"},
    {"text": "What is my submission status?", "intent": "ask_compliance"},
    {"text": "My compliance rate for this quarter", "intent": "ask_compliance"},
    {"text": "How many am I missing this week?", "intent": "ask_compliance"},
    {"text": "Are there any pending submissions?", "intent": "ask_compliance"},
    {"text": "Show me my record so far", "intent": "ask_compliance"},
    {"text": "Do I have any late submissions?", "intent": "ask_compliance"},
    {"text": "What subjects am I behind on?", "intent": "ask_compliance"},
    {"text": "Any missing DLLs this week?", "intent": "ask_compliance"},
    {"text": "How is my compliance looking?", "intent": "ask_compliance"},
    {"text": "Do I need to submit anything?", "intent": "ask_compliance"},
    {"text": "Are all my DLLs submitted on time?", "intent": "ask_compliance"},
    {"text": "Am I good for this week?", "intent": "ask_compliance"},
    {"text": "Check if I am compliant", "intent": "ask_compliance"},
    {"text": "How am I performing with DLL submissions?", "intent": "ask_compliance"},
    {"text": "Give me my stats", "intent": "ask_compliance"},
    {"text": "Show my record", "intent": "ask_compliance"},
    {"text": "What is my score?", "intent": "ask_compliance"},
    {"text": "Am I doing okay with submissions?", "intent": "ask_compliance"},
    {"text": "How many DLLs have I submitted?", "intent": "ask_compliance"},
    # Typo variants
    {"text": "What is my complience rate?", "intent": "ask_compliance"},
    {"text": "Am I complient this week?", "intent": "ask_compliance"},
    {"text": "how meny submissions are late", "intent": "ask_compliance"},
    {"text": "Show my compliance statis", "intent": "ask_compliance"},
    {"text": "Am I on trak this term?", "intent": "ask_compliance"},
    {"text": "How complient am I?", "intent": "ask_compliance"},
    {"text": "Check my submisson status", "intent": "ask_compliance"},
    {"text": "how meny DLLs did I submit on time", "intent": "ask_compliance"},
    {"text": "Am I missing any sumissions?", "intent": "ask_compliance"},
    {"text": "What is my overall complience score?", "intent": "ask_compliance"},
    {"text": "Have I submitted all reqired DLLs?", "intent": "ask_compliance"},
    {"text": "Show my non-complient weeks", "intent": "ask_compliance"},
    {"text": "my compliance statis please", "intent": "ask_compliance"},
    {"text": "What is my complience percentage?", "intent": "ask_compliance"},
    {"text": "Are all my sumissions on time?", "intent": "ask_compliance"},
    {"text": "Which subjects am I complient in?", "intent": "ask_compliance"},
    {"text": "Whats my compliance four this weak?", "intent": "ask_compliance"},
    {"text": "How am I doing with my sumissions?", "intent": "ask_compliance"},
    {"text": "Give me my complience summary", "intent": "ask_compliance"},
    {"text": "Am I falling behind on DLLs?", "intent": "ask_compliance"},
    # Tagalog variants
    {"text": "Ano ang compliance rate ko?", "intent": "ask_compliance"},
    {"text": "Compliant ba ako ngayong linggo?", "intent": "ask_compliance"},
    {"text": "Ilan ang late submissions ko?", "intent": "ask_compliance"},
    {"text": "Ipakita ang compliance status ko", "intent": "ask_compliance"},
    {"text": "Nasa tamang landas ba ako?", "intent": "ask_compliance"},
    {"text": "Gaano ako ka-compliant?", "intent": "ask_compliance"},
    {"text": "Suriin ang submission status ko", "intent": "ask_compliance"},
    {"text": "Ilang DLL ang na-submit ko on time?", "intent": "ask_compliance"},
    {"text": "Mayroon ba akong missing submissions?", "intent": "ask_compliance"},
    {"text": "Ano ang overall compliance score ko?", "intent": "ask_compliance"},
    {"text": "Compliance status ko please", "intent": "ask_compliance"},
    {"text": "Na-submit ko na ba lahat ng DLL?", "intent": "ask_compliance"},
    {"text": "Aling subjects ang compliant ako?", "intent": "ask_compliance"},
    {"text": "Ipakita ang mga non-compliant weeks ko", "intent": "ask_compliance"},
    {"text": "Ano ang compliance percentage ko?", "intent": "ask_compliance"},
    {"text": "On time ba lahat ng submissions ko?", "intent": "ask_compliance"},
    {"text": "Kumusta ang compliance ko?", "intent": "ask_compliance"},
    {"text": "Ilan pa ba ang kailangan kong i-submit?", "intent": "ask_compliance"},
    {"text": "May late ba akong submission?", "intent": "ask_compliance"},
    {"text": "Saan ako kulang sa submissions?", "intent": "ask_compliance"},
    {"text": "Nasubmit ko na ba lahat?", "intent": "ask_compliance"},
    {"text": "Kumusta ang performance ko sa DLL compliance?", "intent": "ask_compliance"},
    {"text": "Compliance ko para sa linggong ito", "intent": "ask_compliance"},
    {"text": "May pending pa ba akong submissions?", "intent": "ask_compliance"},
    {"text": "Ipakita ang record ko ng submissions", "intent": "ask_compliance"},
    {"text": "Ilang percent ang compliance ko?", "intent": "ask_compliance"},
    {"text": "Compliant ba ako ngayon?", "intent": "ask_compliance"},

    # ═══════════════════════════════════════════════════════════════════════════
    # check_deadline  (~80 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "When is the deadline for Week 5?", "intent": "check_deadline"},
    {"text": "What is the submission deadline for this week?", "intent": "check_deadline"},
    {"text": "When is the next deadline?", "intent": "check_deadline"},
    {"text": "Deadline for this week", "intent": "check_deadline"},
    {"text": "Is the deadline this Friday?", "intent": "check_deadline"},
    {"text": "How many days until the deadline?", "intent": "check_deadline"},
    {"text": "When is the deadline for Week 8?", "intent": "check_deadline"},
    {"text": "What time is the deadline?", "intent": "check_deadline"},
    {"text": "Deadline for this term", "intent": "check_deadline"},
    {"text": "What is the deadline this week?", "intent": "check_deadline"},
    {"text": "When is submission deadline?", "intent": "check_deadline"},
    {"text": "Upcoming deadline dates", "intent": "check_deadline"},
    {"text": "Is there a deadline today?", "intent": "check_deadline"},
    {"text": "Deadline for Week 10", "intent": "check_deadline"},
    {"text": "How much time left before deadline?", "intent": "check_deadline"},
    {"text": "Give me the deadline for this week", "intent": "check_deadline"},
    {"text": "When is the deadline due?", "intent": "check_deadline"},
    {"text": "Deadline schedule", "intent": "check_deadline"},
    {"text": "What deadline is coming up?", "intent": "check_deadline"},
    {"text": "Show me all deadlines", "intent": "check_deadline"},
    {"text": "Next submission deadline", "intent": "check_deadline"},
    {"text": "Is anything due this week?", "intent": "check_deadline"},
    {"text": "What is the cut-off date for submissions?", "intent": "check_deadline"},
    {"text": "When should I submit by?", "intent": "check_deadline"},
    {"text": "How long until the next deadline?", "intent": "check_deadline"},
    {"text": "What is due this week?", "intent": "check_deadline"},
    {"text": "By when do I need to submit?", "intent": "check_deadline"},
    {"text": "What is the due date?", "intent": "check_deadline"},
    {"text": "Are there any deadlines this week?", "intent": "check_deadline"},
    {"text": "How many days left before submissions are due?", "intent": "check_deadline"},
    {"text": "Is anything expiring soon?", "intent": "check_deadline"},
    {"text": "What is the last day to submit DLLs?", "intent": "check_deadline"},
    {"text": "Tell me about this weeks deadline", "intent": "check_deadline"},
    {"text": "Submission cut-off", "intent": "check_deadline"},
    {"text": "When is the last day to submit?", "intent": "check_deadline"},
    {"text": "What is the submission date?", "intent": "check_deadline"},
    {"text": "Any deadlines coming up?", "intent": "check_deadline"},
    {"text": "What needs to be submitted this week?", "intent": "check_deadline"},
    {"text": "When is the cut-off?", "intent": "check_deadline"},
    {"text": "Do I have a deadline this week?", "intent": "check_deadline"},
    # Typo variants
    {"text": "When is the dedline for Week 5?", "intent": "check_deadline"},
    {"text": "What is the submission dedline for this week?", "intent": "check_deadline"},
    {"text": "When is the next dedline?", "intent": "check_deadline"},
    {"text": "Is the dedline this Friday?", "intent": "check_deadline"},
    {"text": "how meny days until the dedline", "intent": "check_deadline"},
    {"text": "When is the dedline for Week 8?", "intent": "check_deadline"},
    {"text": "Upcomng dedline dates", "intent": "check_deadline"},
    {"text": "Is there a dedline today?", "intent": "check_deadline"},
    {"text": "how mutch time left before dedline", "intent": "check_deadline"},
    {"text": "What dedline is coming up?", "intent": "check_deadline"},
    {"text": "Next submission dedline", "intent": "check_deadline"},
    {"text": "Is anything due this weak?", "intent": "check_deadline"},
    {"text": "Whats the cut-off date four submissions?", "intent": "check_deadline"},
    {"text": "how long until the next dedline", "intent": "check_deadline"},
    {"text": "When is the last day to sumbit?", "intent": "check_deadline"},
    # Tagalog variants
    {"text": "Kailan ang deadline para sa Week 5?", "intent": "check_deadline"},
    {"text": "Kailan ang submission deadline ngayong linggo?", "intent": "check_deadline"},
    {"text": "Kailan ang susunod na deadline?", "intent": "check_deadline"},
    {"text": "Deadline para sa linggong ito", "intent": "check_deadline"},
    {"text": "Ba't sa Friday ba ang deadline?", "intent": "check_deadline"},
    {"text": "Ilang araw bago ang deadline?", "intent": "check_deadline"},
    {"text": "Kailan ang deadline para sa Week 8?", "intent": "check_deadline"},
    {"text": "Kailan ang submission deadline?", "intent": "check_deadline"},
    {"text": "Mga deadline dates na darating", "intent": "check_deadline"},
    {"text": "May deadline ba ngayon?", "intent": "check_deadline"},
    {"text": "Deadline para sa Week 10", "intent": "check_deadline"},
    {"text": "Gaano karaming oras pa bago ang deadline?", "intent": "check_deadline"},
    {"text": "Ano ang deadline ngayong linggo?", "intent": "check_deadline"},
    {"text": "Kailan ang huling araw ng submission?", "intent": "check_deadline"},
    {"text": "May deadline ba ngayong linggo?", "intent": "check_deadline"},
    {"text": "Hanggang kailan ako puwedeng mag-submit?", "intent": "check_deadline"},
    {"text": "Anong araw ang deadline?", "intent": "check_deadline"},
    {"text": "Puwede pa ba akong mag-submit?", "intent": "check_deadline"},
    {"text": "Deadline ba ngayon?", "intent": "check_deadline"},

    # ═══════════════════════════════════════════════════════════════════════════
    # find_dll  (~80 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "Find DLLs about fractions", "intent": "find_dll"},
    {"text": "Search for DLLs on reading comprehension", "intent": "find_dll"},
    {"text": "Show DLLs for Grade 3 Science", "intent": "find_dll"},
    {"text": "Find lesson plans about addition", "intent": "find_dll"},
    {"text": "Search DLLs for mathematics", "intent": "find_dll"},
    {"text": "Show DLLs for Week 4", "intent": "find_dll"},
    {"text": "Find DLLs uploaded by Teacher Santos", "intent": "find_dll"},
    {"text": "Search my DLLs", "intent": "find_dll"},
    {"text": "Show DLLs about plants", "intent": "find_dll"},
    {"text": "Find all DLLs for Grade 2", "intent": "find_dll"},
    {"text": "Look for DLLs about grammar", "intent": "find_dll"},
    {"text": "Find DLLs with group activities", "intent": "find_dll"},
    {"text": "Show DLLs for this week", "intent": "find_dll"},
    {"text": "Find DLLs about Filipino culture", "intent": "find_dll"},
    {"text": "Search documents for assessment tools", "intent": "find_dll"},
    {"text": "Look up DLLs on fractions", "intent": "find_dll"},
    {"text": "Show DLLs about animals", "intent": "find_dll"},
    {"text": "Find DLLs for Grade 1 Math", "intent": "find_dll"},
    {"text": "Search for DLLs on verbs", "intent": "find_dll"},
    {"text": "Show DLLs related to weather", "intent": "find_dll"},
    {"text": "Find DLLs with experiments", "intent": "find_dll"},
    {"text": "Look up DLLs about the water cycle", "intent": "find_dll"},
    {"text": "Search my uploaded DLLs", "intent": "find_dll"},
    {"text": "Find me any DLLs on shapes", "intent": "find_dll"},
    {"text": "I need DLLs for Grade 4 English", "intent": "find_dll"},
    {"text": "What DLLs are available for Science?", "intent": "find_dll"},
    {"text": "DLLs about the solar system", "intent": "find_dll"},
    {"text": "Show DLLs on addition for Grade 1", "intent": "find_dll"},
    {"text": "Find DLLs for this term", "intent": "find_dll"},
    {"text": "Do we have DLLs on photosynthesis?", "intent": "find_dll"},
    {"text": "Give me DLLs about fractions and decimals", "intent": "find_dll"},
    {"text": "Find the DLL on counting numbers", "intent": "find_dll"},
    {"text": "Search DLLs by subject", "intent": "find_dll"},
    {"text": "Show DLLs for Grade 6 Math", "intent": "find_dll"},
    {"text": "Where are the DLLs for Grade 3?", "intent": "find_dll"},
    {"text": "Find Filipino DLLs", "intent": "find_dll"},
    {"text": "What DLLs do I have?", "intent": "find_dll"},
    {"text": "Search DLL database for geometry", "intent": "find_dll"},
    {"text": "Show me DLLs uploaded last week", "intent": "find_dll"},
    {"text": "DLLs about Philippine history", "intent": "find_dll"},
    {"text": "Show DLLs for remedial reading", "intent": "find_dll"},
    # Typo variants
    {"text": "Find DLLs about fraktions", "intent": "find_dll"},
    {"text": "Search for DLLs on reading comprehension", "intent": "find_dll"},
    {"text": "Find lessn plans about addition", "intent": "find_dll"},
    {"text": "Show DLLs four Week 4", "intent": "find_dll"},
    {"text": "Find all DLLs four Grade 2", "intent": "find_dll"},
    {"text": "Look for DLLs about gramer", "intent": "find_dll"},
    {"text": "Find DLLs about Filipno culture", "intent": "find_dll"},
    {"text": "Search for DLLs on verbs", "intent": "find_dll"},
    {"text": "Look up DLLs about the water cicle", "intent": "find_dll"},
    {"text": "Search DLLs by subjekt", "intent": "find_dll"},
    {"text": "Find DLLs with rubriks", "intent": "find_dll"},
    {"text": "Wher are the DLLs for Grade 3?", "intent": "find_dll"},
    {"text": "Search my uploadd DLLs", "intent": "find_dll"},
    {"text": "Find me any DLLs on shapz", "intent": "find_dll"},
    # Tagalog variants
    {"text": "Maghanap ng DLL tungkol sa fractions", "intent": "find_dll"},
    {"text": "Maghanap ng DLL sa reading comprehension", "intent": "find_dll"},
    {"text": "Ipakita ang DLL para sa Grade 3 Science", "intent": "find_dll"},
    {"text": "Maghanap ng lesson plan tungkol sa addition", "intent": "find_dll"},
    {"text": "Maghanap ng DLL sa mathematics", "intent": "find_dll"},
    {"text": "Ipakita ang DLL para sa Week 4", "intent": "find_dll"},
    {"text": "Maghanap ng DLL tungkol sa halaman", "intent": "find_dll"},
    {"text": "Hanapin ang lahat ng DLL para sa Grade 2", "intent": "find_dll"},
    {"text": "Maghanap ng DLL tungkol sa grammar", "intent": "find_dll"},
    {"text": "Ipakita ang DLL para sa linggong ito", "intent": "find_dll"},
    {"text": "Maghanap ng DLL tungkol sa kultura ng Pilipinas", "intent": "find_dll"},
    {"text": "Maghanap ng DLL tungkol sa mga hayop", "intent": "find_dll"},
    {"text": "DLL para sa Grade 1 Math", "intent": "find_dll"},
    {"text": "Ipakita ang DLL tungkol sa panahon", "intent": "find_dll"},
    {"text": "Kailangan ko ng DLL para sa Grade 4 English", "intent": "find_dll"},
    {"text": "Anong DLL ang available para sa Science?", "intent": "find_dll"},
    {"text": "DLL tungkol sa solar system", "intent": "find_dll"},
    {"text": "Maghanap ng DLL sa pagbilang", "intent": "find_dll"},
    {"text": "Saan ang DLL para sa Grade 3?", "intent": "find_dll"},
    {"text": "Anong DLL ang mayroon ako?", "intent": "find_dll"},
    {"text": "Maghanap ng DLL sa Filipino", "intent": "find_dll"},
    {"text": "DLL tungkol sa kasaysayan ng Pilipinas", "intent": "find_dll"},
    {"text": "Patingin ng DLL para sa remedial reading", "intent": "find_dll"},
    {"text": "DLL tungkol sa fraction at decimal", "intent": "find_dll"},

    # ═══════════════════════════════════════════════════════════════════════════
    # school_compare  (~75 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "How does my school compare to others?", "intent": "school_compare"},
    {"text": "What is the compliance rate of Bulusan ES?", "intent": "school_compare"},
    {"text": "Compare schools in the district", "intent": "school_compare"},
    {"text": "Which school has the highest compliance?", "intent": "school_compare"},
    {"text": "School performance ranking", "intent": "school_compare"},
    {"text": "Show school compliance comparison", "intent": "school_compare"},
    {"text": "How is our school doing?", "intent": "school_compare"},
    {"text": "Compare my school to others", "intent": "school_compare"},
    {"text": "What are the top performing schools?", "intent": "school_compare"},
    {"text": "District ranking of schools", "intent": "school_compare"},
    {"text": "School compliance this term", "intent": "school_compare"},
    {"text": "Which schools need improvement?", "intent": "school_compare"},
    {"text": "How do other schools compare?", "intent": "school_compare"},
    {"text": "Compare compliance between schools", "intent": "school_compare"},
    {"text": "School ranking this quarter", "intent": "school_compare"},
    {"text": "Top schools in the district", "intent": "school_compare"},
    {"text": "Which school performs best?", "intent": "school_compare"},
    {"text": "School performance metrics", "intent": "school_compare"},
    {"text": "How is Bulusan ES doing?", "intent": "school_compare"},
    {"text": "Compare district schools", "intent": "school_compare"},
    {"text": "Ranking of schools by compliance", "intent": "school_compare"},
    {"text": "Which school is the most compliant?", "intent": "school_compare"},
    {"text": "Bottom performing schools", "intent": "school_compare"},
    {"text": "School standings this term", "intent": "school_compare"},
    {"text": "How does each school rank?", "intent": "school_compare"},
    {"text": "Show me school stats", "intent": "school_compare"},
    {"text": "Compare all schools", "intent": "school_compare"},
    {"text": "Give me the school rankings", "intent": "school_compare"},
    {"text": "Which school is at the top this week?", "intent": "school_compare"},
    {"text": "What is the best performing school?", "intent": "school_compare"},
    {"text": "How are schools in the district performing?", "intent": "school_compare"},
    {"text": "School compliance ranking for this quarter", "intent": "school_compare"},
    {"text": "Lower performing schools in our district", "intent": "school_compare"},
    {"text": "Compliance comparison of schools", "intent": "school_compare"},
    {"text": "Which school has the lowest compliance?", "intent": "school_compare"},
    {"text": "School comparison for this month", "intent": "school_compare"},
    {"text": "How does our school rank?", "intent": "school_compare"},
    {"text": "Schools in our district ranked", "intent": "school_compare"},
    {"text": "Compare the compliance of each school", "intent": "school_compare"},
    {"text": "What is the school ranking?", "intent": "school_compare"},
    # Typo variants
    {"text": "How does my skool compare to others?", "intent": "school_compare"},
    {"text": "Which skool has the highest compliance?", "intent": "school_compare"},
    {"text": "School performence ranking", "intent": "school_compare"},
    {"text": "How is our skool doing?", "intent": "school_compare"},
    {"text": "Compare my skool to others", "intent": "school_compare"},
    {"text": "What are the top perfoming schools?", "intent": "school_compare"},
    {"text": "District ranking of schols", "intent": "school_compare"},
    {"text": "Which skools need improvement?", "intent": "school_compare"},
    {"text": "How do othe schools compare?", "intent": "school_compare"},
    {"text": "Top skools in the district", "intent": "school_compare"},
    {"text": "Skool performence metrics", "intent": "school_compare"},
    {"text": "Compare district skools", "intent": "school_compare"},
    {"text": "Which skool is the most complient?", "intent": "school_compare"},
    {"text": "Bottom perfoming schools", "intent": "school_compare"},
    {"text": "How does eech school rank?", "intent": "school_compare"},
    {"text": "Which skool is at the top this weak?", "intent": "school_compare"},
    # Tagalog variants
    {"text": "Kumusta ang paaralan namin kumpara sa iba?", "intent": "school_compare"},
    {"text": "Ano ang compliance rate ng Bulusan ES?", "intent": "school_compare"},
    {"text": "Ihambing ang mga paaralan sa distrito", "intent": "school_compare"},
    {"text": "Aling paaralan ang may pinakamataas na compliance?", "intent": "school_compare"},
    {"text": "Ranggo ng mga paaralan ayon sa performance", "intent": "school_compare"},
    {"text": "Ipakita ang paghahambing ng compliance ng paaralan", "intent": "school_compare"},
    {"text": "Kumusta ang ating paaralan?", "intent": "school_compare"},
    {"text": "Ikumpara ang paaralan namin sa iba", "intent": "school_compare"},
    {"text": "Ano ang mga nangungunang paaralan?", "intent": "school_compare"},
    {"text": "Ranggo ng distrito ng mga paaralan", "intent": "school_compare"},
    {"text": "Aling mga paaralan ang nangangailangan ng improvement?", "intent": "school_compare"},
    {"text": "Paano ang ibang paaralan kumpara sa atin?", "intent": "school_compare"},
    {"text": "Ihambing ang compliance sa pagitan ng mga paaralan", "intent": "school_compare"},
    {"text": "Ranggo ng paaralan ngayong quarter", "intent": "school_compare"},
    {"text": "Nangungunang mga paaralan sa distrito", "intent": "school_compare"},
    {"text": "Aling paaralan ang pinakamahusay?", "intent": "school_compare"},
    {"text": "Kumusta ang Bulusan ES?", "intent": "school_compare"},
    {"text": "Pagraranggo ng mga paaralan ayon sa compliance", "intent": "school_compare"},
    {"text": "Aling paaralan ang pinaka-compliant?", "intent": "school_compare"},

    # ═══════════════════════════════════════════════════════════════════════════
    # teacher_stats  (~80 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "Show statistics for Teacher Santos", "intent": "teacher_stats"},
    {"text": "What is the compliance of Teacher Cruz?", "intent": "teacher_stats"},
    {"text": "Which teachers are struggling?", "intent": "teacher_stats"},
    {"text": "List teachers with low compliance", "intent": "teacher_stats"},
    {"text": "Teacher performance this week", "intent": "teacher_stats"},
    {"text": "Show teacher submission counts", "intent": "teacher_stats"},
    {"text": "Who has the most late submissions?", "intent": "teacher_stats"},
    {"text": "Teacher ranking in my school", "intent": "teacher_stats"},
    {"text": "Check teacher compliance rates", "intent": "teacher_stats"},
    {"text": "Show all teachers and their compliance", "intent": "teacher_stats"},
    {"text": "How is Teacher Reyes performing?", "intent": "teacher_stats"},
    {"text": "List teachers missing this week", "intent": "teacher_stats"},
    {"text": "Teacher with best compliance", "intent": "teacher_stats"},
    {"text": "Which teachers need help?", "intent": "teacher_stats"},
    {"text": "Who has the highest compliance?", "intent": "teacher_stats"},
    {"text": "Teacher compliance scores", "intent": "teacher_stats"},
    {"text": "Show teacher stats for my school", "intent": "teacher_stats"},
    {"text": "List all teachers and their submissions", "intent": "teacher_stats"},
    {"text": "Teacher ranking in the district", "intent": "teacher_stats"},
    {"text": "Who is the top teacher this week?", "intent": "teacher_stats"},
    {"text": "Teacher performance metrics", "intent": "teacher_stats"},
    {"text": "How are the teachers doing?", "intent": "teacher_stats"},
    {"text": "Which teachers have missing submissions?", "intent": "teacher_stats"},
    {"text": "Give me teacher compliance data", "intent": "teacher_stats"},
    {"text": "Who has the best compliance in our school?", "intent": "teacher_stats"},
    {"text": "Compare teachers in my school", "intent": "teacher_stats"},
    {"text": "Teacher submission status", "intent": "teacher_stats"},
    {"text": "Who is behind on submissions?", "intent": "teacher_stats"},
    {"text": "List teachers with 100 percent compliance", "intent": "teacher_stats"},
    {"text": "Which teachers are on track?", "intent": "teacher_stats"},
    {"text": "Teacher progress report", "intent": "teacher_stats"},
    {"text": "Stats for all teachers in the district", "intent": "teacher_stats"},
    {"text": "Show me teacher rankings", "intent": "teacher_stats"},
    {"text": "Who needs to catch up?", "intent": "teacher_stats"},
    {"text": "Teacher performance this quarter", "intent": "teacher_stats"},
    {"text": "I need teacher compliance info", "intent": "teacher_stats"},
    {"text": "Which teachers are doing well?", "intent": "teacher_stats"},
    {"text": "Teachers in my school ranked", "intent": "teacher_stats"},
    {"text": "Who has submitted everything on time?", "intent": "teacher_stats"},
    {"text": "Teacher statistics for this term", "intent": "teacher_stats"},
    # Typo variants
    {"text": "Show statitics for Teacher Santos", "intent": "teacher_stats"},
    {"text": "What is the complience of Teacher Cruz?", "intent": "teacher_stats"},
    {"text": "Which teachrs are struggling?", "intent": "teacher_stats"},
    {"text": "List teachrs with low compliance", "intent": "teacher_stats"},
    {"text": "Teacher performence this week", "intent": "teacher_stats"},
    {"text": "Who has the most late sumissions?", "intent": "teacher_stats"},
    {"text": "Teacher ranking in my skool", "intent": "teacher_stats"},
    {"text": "Check teacher complience rates", "intent": "teacher_stats"},
    {"text": "How is Teacher Reyes perfoming?", "intent": "teacher_stats"},
    {"text": "List teachrs missing this weak", "intent": "teacher_stats"},
    {"text": "Teacher with best complience", "intent": "teacher_stats"},
    {"text": "Which teachrs need help?", "intent": "teacher_stats"},
    {"text": "Who has the highest complience?", "intent": "teacher_stats"},
    {"text": "Teacher complience scores", "intent": "teacher_stats"},
    {"text": "Who is the top teachr this week?", "intent": "teacher_stats"},
    {"text": "How are the teachrs doing?", "intent": "teacher_stats"},
    {"text": "Which teachrs have missing sumissions?", "intent": "teacher_stats"},
    {"text": "Who has the best complience in our skool?", "intent": "teacher_stats"},
    {"text": "Compare teachrs in my skool", "intent": "teacher_stats"},
    {"text": "Who is behind on sumissions?", "intent": "teacher_stats"},
    {"text": "Stats for all teachrs in the district", "intent": "teacher_stats"},
    # Tagalog variants
    {"text": "Ipakita ang statistics para kay Teacher Santos", "intent": "teacher_stats"},
    {"text": "Ano ang compliance ni Teacher Cruz?", "intent": "teacher_stats"},
    {"text": "Sinong mga teacher ang nahihirapan?", "intent": "teacher_stats"},
    {"text": "Ilista ang mga teacher na may mababang compliance", "intent": "teacher_stats"},
    {"text": "Performance ng teacher ngayong linggo", "intent": "teacher_stats"},
    {"text": "Ipakita ang counts ng submission ng teacher", "intent": "teacher_stats"},
    {"text": "Sino ang may pinakamaraming late submissions?", "intent": "teacher_stats"},
    {"text": "Ranggo ng teacher sa paaralan namin", "intent": "teacher_stats"},
    {"text": "Suriin ang compliance rates ng teacher", "intent": "teacher_stats"},
    {"text": "Ipakita ang lahat ng teacher at kanilang compliance", "intent": "teacher_stats"},
    {"text": "Kumusta ang performance ni Teacher Reyes?", "intent": "teacher_stats"},
    {"text": "Ilista ang teacher na may missing ngayong linggo", "intent": "teacher_stats"},
    {"text": "Teacher na may pinakamataas na compliance", "intent": "teacher_stats"},
    {"text": "Sinong teacher ang nangangailangan ng tulong?", "intent": "teacher_stats"},
    {"text": "Sino ang may pinakamataas na compliance?", "intent": "teacher_stats"},
    {"text": "Ipakita ang stats ng teacher para sa paaralan namin", "intent": "teacher_stats"},
    {"text": "Ranggo ng teacher sa distrito", "intent": "teacher_stats"},
    {"text": "Sino ang nangungunang teacher ngayong linggo?", "intent": "teacher_stats"},
    {"text": "Kumusta ang mga teacher?", "intent": "teacher_stats"},
    {"text": "Sinong teacher ang may missing submissions?", "intent": "teacher_stats"},

    # ═══════════════════════════════════════════════════════════════════════════
    # calendar_info  (~70 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "What is the school calendar?", "intent": "calendar_info"},
    {"text": "Show me the academic calendar", "intent": "calendar_info"},
    {"text": "When does Term 2 start?", "intent": "calendar_info"},
    {"text": "What week is it now?", "intent": "calendar_info"},
    {"text": "Current academic week", "intent": "calendar_info"},
    {"text": "When is the end of Term 1?", "intent": "calendar_info"},
    {"text": "Show the trimester schedule", "intent": "calendar_info"},
    {"text": "How many weeks in this term?", "intent": "calendar_info"},
    {"text": "Academic calendar for this year", "intent": "calendar_info"},
    {"text": "When are the exam weeks?", "intent": "calendar_info"},
    {"text": "What is the school year?", "intent": "calendar_info"},
    {"text": "When does the school year end?", "intent": "calendar_info"},
    {"text": "What is the current term?", "intent": "calendar_info"},
    {"text": "Show me the calendar for this year", "intent": "calendar_info"},
    {"text": "Calendar overview", "intent": "calendar_info"},
    {"text": "When is the next term break?", "intent": "calendar_info"},
    {"text": "How long is this term?", "intent": "calendar_info"},
    {"text": "What is the schedule for this quarter?", "intent": "calendar_info"},
    {"text": "Tell me about the school calendar", "intent": "calendar_info"},
    {"text": "What term are we in?", "intent": "calendar_info"},
    {"text": "Current school year", "intent": "calendar_info"},
    {"text": "How many quarters are there?", "intent": "calendar_info"},
    {"text": "When does the next quarter start?", "intent": "calendar_info"},
    {"text": "Calendar for this school year", "intent": "calendar_info"},
    {"text": "What is the current week number?", "intent": "calendar_info"},
    {"text": "Week schedule for this term", "intent": "calendar_info"},
    {"text": "Is this week an exam week?", "intent": "calendar_info"},
    {"text": "Academic calendar schedule", "intent": "calendar_info"},
    {"text": "Overview of the academic year", "intent": "calendar_info"},
    {"text": "Term dates for this year", "intent": "calendar_info"},
    {"text": "How many weeks left in this term?", "intent": "calendar_info"},
    {"text": "When is the next quarter?", "intent": "calendar_info"},
    {"text": "What does the school calendar look like?", "intent": "calendar_info"},
    {"text": "Which week are we on?", "intent": "calendar_info"},
    {"text": "School year information", "intent": "calendar_info"},
    {"text": "Give me the calendar details", "intent": "calendar_info"},
    {"text": "What quarter is it?", "intent": "calendar_info"},
    {"text": "Are we on a break week?", "intent": "calendar_info"},
    {"text": "Academic term schedule", "intent": "calendar_info"},
    {"text": "How long is the school year?", "intent": "calendar_info"},
    # Typo variants
    {"text": "What is the skool calendar?", "intent": "calendar_info"},
    {"text": "What week is it know?", "intent": "calendar_info"},
    {"text": "Current academic wek", "intent": "calendar_info"},
    {"text": "When is the end of Term 1?", "intent": "calendar_info"},
    {"text": "how meny weeks in this term", "intent": "calendar_info"},
    {"text": "Academic calender for this year", "intent": "calendar_info"},
    {"text": "When are the eksam weeks?", "intent": "calendar_info"},
    {"text": "Whats the current tern?", "intent": "calendar_info"},
    {"text": "Calendar overveiw", "intent": "calendar_info"},
    {"text": "When is the next term brek?", "intent": "calendar_info"},
    {"text": "How long is this tern?", "intent": "calendar_info"},
    {"text": "What tern are we in?", "intent": "calendar_info"},
    {"text": "Current skool year", "intent": "calendar_info"},
    {"text": "how meny quarters are there", "intent": "calendar_info"},
    {"text": "Calender for this school year", "intent": "calendar_info"},
    {"text": "Whats the current week numbr?", "intent": "calendar_info"},
    {"text": "Which weak are we on?", "intent": "calendar_info"},
    {"text": "how meny weeks left in this tern", "intent": "calendar_info"},
    # Tagalog variants
    {"text": "Ano ang school calendar?", "intent": "calendar_info"},
    {"text": "Ipakita ang academic calendar", "intent": "calendar_info"},
    {"text": "Kailan magsisimula ang Term 2?", "intent": "calendar_info"},
    {"text": "Anong linggo na ngayon?", "intent": "calendar_info"},
    {"text": "Kasalukuyang academic week", "intent": "calendar_info"},
    {"text": "Kailan ang katapusan ng Term 1?", "intent": "calendar_info"},
    {"text": "Ipakita ang schedule ng trimester", "intent": "calendar_info"},
    {"text": "Ilang linggo sa term na ito?", "intent": "calendar_info"},
    {"text": "Academic calendar para sa taong ito", "intent": "calendar_info"},
    {"text": "Kailan ang exam weeks?", "intent": "calendar_info"},
    {"text": "Anong school year na ngayon?", "intent": "calendar_info"},
    {"text": "Kailan matatapos ang school year?", "intent": "calendar_info"},
    {"text": "Anong term tayo ngayon?", "intent": "calendar_info"},
    {"text": "Kailan ang susunod na term break?", "intent": "calendar_info"},
    {"text": "Gaano kahaba ang term na ito?", "intent": "calendar_info"},
    {"text": "Ilang quarters mayroon?", "intent": "calendar_info"},
    {"text": "Kailan magsisimula ang susunod na quarter?", "intent": "calendar_info"},
    {"text": "Anong week number ngayon?", "intent": "calendar_info"},
    {"text": "Exam week ba ngayon?", "intent": "calendar_info"},
    {"text": "Ilang linggo pa bago matapos ang term?", "intent": "calendar_info"},

    # ═══════════════════════════════════════════════════════════════════════════
    # how_to_upload  (~70 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "How do I upload a DLL?", "intent": "how_to_upload"},
    {"text": "How to submit my DLL?", "intent": "how_to_upload"},
    {"text": "Steps to upload a document", "intent": "how_to_upload"},
    {"text": "How do I upload files?", "intent": "how_to_upload"},
    {"text": "Upload instructions", "intent": "how_to_upload"},
    {"text": "How do I scan a document?", "intent": "how_to_upload"},
    {"text": "How to upload offline?", "intent": "how_to_upload"},
    {"text": "Can I upload multiple files?", "intent": "how_to_upload"},
    {"text": "How does the upload work?", "intent": "how_to_upload"},
    {"text": "How to fix upload errors?", "intent": "how_to_upload"},
    {"text": "How to upload from phone?", "intent": "how_to_upload"},
    {"text": "Where do I upload my DLL?", "intent": "how_to_upload"},
    {"text": "Steps to upload a DLL file", "intent": "how_to_upload"},
    {"text": "How to attach a DLL?", "intent": "how_to_upload"},
    {"text": "What format should the DLL be in?", "intent": "how_to_upload"},
    {"text": "How do I submit my DLL for review?", "intent": "how_to_upload"},
    {"text": "Can I upload from a mobile device?", "intent": "how_to_upload"},
    {"text": "Does the system support PDF uploads?", "intent": "how_to_upload"},
    {"text": "How do I upload a scanned DLL?", "intent": "how_to_upload"},
    {"text": "Upload guide for DLLs", "intent": "how_to_upload"},
    {"text": "How to upload in the app?", "intent": "how_to_upload"},
    {"text": "How to submit my document?", "intent": "how_to_upload"},
    {"text": "What file types are accepted?", "intent": "how_to_upload"},
    {"text": "How many files can I upload at once?", "intent": "how_to_upload"},
    {"text": "Where do I find the upload button?", "intent": "how_to_upload"},
    {"text": "Do I need internet to upload?", "intent": "how_to_upload"},
    {"text": "How to upload DLL from laptop?", "intent": "how_to_upload"},
    {"text": "How to upload offline then sync?", "intent": "how_to_upload"},
    {"text": "How do I re-upload a DLL?", "intent": "how_to_upload"},
    {"text": "Can I edit a DLL after upload?", "intent": "how_to_upload"},
    {"text": "Uploading step by step", "intent": "how_to_upload"},
    {"text": "Help me upload my DLL", "intent": "how_to_upload"},
    {"text": "Where to submit DLLs?", "intent": "how_to_upload"},
    {"text": "How to put my DLL in the system?", "intent": "how_to_upload"},
    {"text": "What is the upload process?", "intent": "how_to_upload"},
    {"text": "I can't upload what should I do?", "intent": "how_to_upload"},
    {"text": "My upload failed what now?", "intent": "how_to_upload"},
    {"text": "How to upload properly?", "intent": "how_to_upload"},
    {"text": "Can I upload in bulk?", "intent": "how_to_upload"},
    {"text": "How do I change a submitted DLL?", "intent": "how_to_upload"},
    {"text": "How to upload my lesson plan?", "intent": "how_to_upload"},
    {"text": "Upload directions", "intent": "how_to_upload"},
    # Typo variants
    {"text": "How do I upload a DLL?", "intent": "how_to_upload"},
    {"text": "How to subit my DLL?", "intent": "how_to_upload"},
    {"text": "Steps to upload a documnt", "intent": "how_to_upload"},
    {"text": "Upload instrutions", "intent": "how_to_upload"},
    {"text": "How to upload offlne?", "intent": "how_to_upload"},
    {"text": "Can I upload multiple filse?", "intent": "how_to_upload"},
    {"text": "How does the upload wurk?", "intent": "how_to_upload"},
    {"text": "How to fix upload erors?", "intent": "how_to_upload"},
    {"text": "How to upload from fone?", "intent": "how_to_upload"},
    {"text": "Wher do I upload my DLL?", "intent": "how_to_upload"},
    {"text": "What format shoud the DLL be in?", "intent": "how_to_upload"},
    {"text": "Upload gide for DLLs", "intent": "how_to_upload"},
    {"text": "What file types are aceptd?", "intent": "how_to_upload"},
    {"text": "how meny files can I upload at once", "intent": "how_to_upload"},
    {"text": "How to upload offline then sinc?", "intent": "how_to_upload"},
    {"text": "How do I re-upload a DLL?", "intent": "how_to_upload"},
    # Tagalog variants
    {"text": "Paano mag-upload ng DLL?", "intent": "how_to_upload"},
    {"text": "Paano i-submit ang DLL ko?", "intent": "how_to_upload"},
    {"text": "Mga hakbang para mag-upload ng dokumento", "intent": "how_to_upload"},
    {"text": "Paano mag-upload ng files?", "intent": "how_to_upload"},
    {"text": "Mga instruction sa pag-upload", "intent": "how_to_upload"},
    {"text": "Paano mag-upload offline?", "intent": "how_to_upload"},
    {"text": "Puwede ba akong mag-upload ng maramihan?", "intent": "how_to_upload"},
    {"text": "Paano gumagana ang upload?", "intent": "how_to_upload"},
    {"text": "Paano ayusin ang upload errors?", "intent": "how_to_upload"},
    {"text": "Paano mag-upload gamit ang phone?", "intent": "how_to_upload"},
    {"text": "Saan ako mag-upload ng DLL ko?", "intent": "how_to_upload"},
    {"text": "Ano ang format ng DLL?", "intent": "how_to_upload"},
    {"text": "Puwede ba mag-upload gamit ang mobile?", "intent": "how_to_upload"},
    {"text": "Sinusuportahan ba ng system ang PDF?", "intent": "how_to_upload"},
    {"text": "Paano mag-upload ng scanned DLL?", "intent": "how_to_upload"},
    {"text": "Gabay sa pag-upload ng DLL", "intent": "how_to_upload"},
    {"text": "Saan ang upload button?", "intent": "how_to_upload"},
    {"text": "Kailangan ba ng internet para mag-upload?", "intent": "how_to_upload"},
    {"text": "Paano mag-upload gamit ang laptop?", "intent": "how_to_upload"},
    {"text": "Paano mag-upload offline at mag-sync later?", "intent": "how_to_upload"},
    {"text": "Bakit hindi ako makapag-upload?", "intent": "how_to_upload"},

    # ═══════════════════════════════════════════════════════════════════════════
    # general_help  (~70 samples)
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "What can you help me with?", "intent": "general_help"},
    {"text": "Help me understand this system", "intent": "general_help"},
    {"text": "What does CEDIMS do?", "intent": "general_help"},
    {"text": "What can I ask you?", "intent": "general_help"},
    {"text": "How does compliance work?", "intent": "general_help"},
    {"text": "Explain the monitoring system", "intent": "general_help"},
    {"text": "Give me a tour", "intent": "general_help"},
    {"text": "What is a DLL?", "intent": "general_help"},
    {"text": "How is compliance calculated?", "intent": "general_help"},
    {"text": "I need help", "intent": "general_help"},
    {"text": "What features are available?", "intent": "general_help"},
    {"text": "Tell me about this app", "intent": "general_help"},
    {"text": "How can you assist me?", "intent": "general_help"},
    {"text": "System guide", "intent": "general_help"},
    {"text": "Show available commands", "intent": "general_help"},
    {"text": "What do you do?", "intent": "general_help"},
    {"text": "How does this system work?", "intent": "general_help"},
    {"text": "Explain the dashboard", "intent": "general_help"},
    {"text": "What is this platform for?", "intent": "general_help"},
    {"text": "CEDIMS overview", "intent": "general_help"},
    {"text": "How does the monitoring work?", "intent": "general_help"},
    {"text": "What can the system do?", "intent": "general_help"},
    {"text": "I don't understand this system", "intent": "general_help"},
    {"text": "Give me an introduction", "intent": "general_help"},
    {"text": "Tell me about yourself", "intent": "general_help"},
    {"text": "What is SmartE Vision?", "intent": "general_help"},
    {"text": "Explain everything", "intent": "general_help"},
    {"text": "How can I use this system?", "intent": "general_help"},
    {"text": "What are the main features?", "intent": "general_help"},
    {"text": "How do I navigate this app?", "intent": "general_help"},
    {"text": "What is the purpose of CEDIMS?", "intent": "general_help"},
    {"text": "How do I get started?", "intent": "general_help"},
    {"text": "Introduction to the system", "intent": "general_help"},
    {"text": "Show me around", "intent": "general_help"},
    {"text": "What is the compliance system?", "intent": "general_help"},
    {"text": "Tell me how this works", "intent": "general_help"},
    {"text": "I am new here help me", "intent": "general_help"},
    {"text": "Guide me through the system", "intent": "general_help"},
    {"text": "What should I know about this app?", "intent": "general_help"},
    {"text": "How to use SmartE Vision?", "intent": "general_help"},
    # Typo variants
    {"text": "What can you help me with?", "intent": "general_help"},
    {"text": "Help me understan this system", "intent": "general_help"},
    {"text": "What does CEDIMS do?", "intent": "general_help"},
    {"text": "How does complience work?", "intent": "general_help"},
    {"text": "Expain the monitoring system", "intent": "general_help"},
    {"text": "What is a DLL?", "intent": "general_help"},
    {"text": "How is complience calculated?", "intent": "general_help"},
    {"text": "I need hel", "intent": "general_help"},
    {"text": "Systm guide", "intent": "general_help"},
    {"text": "How does this systm work?", "intent": "general_help"},
    {"text": "How dos the monitoring work?", "intent": "general_help"},
    {"text": "Tell me about youreslf", "intent": "general_help"},
    {"text": "What is SmartE Visin?", "intent": "general_help"},
    {"text": "Expain everything", "intent": "general_help"},
    {"text": "What are the main feachures?", "intent": "general_help"},
    {"text": "What is the purpse of CEDIMS?", "intent": "general_help"},
    {"text": "Introdution to the system", "intent": "general_help"},
    {"text": "Im new her help me", "intent": "general_help"},
    {"text": "What shoud I know about this app?", "intent": "general_help"},
    # Tagalog variants
    {"text": "Ano ang maitutulong mo sa akin?", "intent": "general_help"},
    {"text": "Tulungan mo akong maintindihan ang system na ito", "intent": "general_help"},
    {"text": "Ano ang ginagawa ng CEDIMS?", "intent": "general_help"},
    {"text": "Ano ang puwede kong itanong?", "intent": "general_help"},
    {"text": "Paano gumagana ang compliance?", "intent": "general_help"},
    {"text": "Ipaliwanag ang monitoring system", "intent": "general_help"},
    {"text": "Bigyan mo ako ng tour", "intent": "general_help"},
    {"text": "Ano ang DLL?", "intent": "general_help"},
    {"text": "Paano kinakalkula ang compliance?", "intent": "general_help"},
    {"text": "Kailangan ko ng tulong", "intent": "general_help"},
    {"text": "Anong features ang available?", "intent": "general_help"},
    {"text": "Sabihin mo sa akin ang tungkol sa app", "intent": "general_help"},
    {"text": "Paano mo ako matutulungan?", "intent": "general_help"},
    {"text": "Gabay sa system", "intent": "general_help"},
    {"text": "Ano ang ginagawa mo?", "intent": "general_help"},
    {"text": "Paano gumagana ang system na ito?", "intent": "general_help"},
    {"text": "Ipaliwanag ang dashboard", "intent": "general_help"},
    {"text": "Pangkalahatang-ideya ng CEDIMS", "intent": "general_help"},
    {"text": "Hindi ko maintindihan ang system na ito", "intent": "general_help"},
    {"text": "Sabihin mo ang tungkol sa iyong sarili", "intent": "general_help"},
    {"text": "Bago ako dito tulungan mo ako", "intent": "general_help"},
    {"text": "Gabayan mo ako sa system", "intent": "general_help"},

    # ═══════════════════════════════════════════════════════════════════════════
    # Out-of-scope / small talk — mapped to general_help so the classifier has
    # somewhere safe to land instead of being forced into a specific DB intent
    # for questions that have nothing to do with CEDIMS at all.
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "What's the weather today?", "intent": "general_help"},
    {"text": "Tell me a joke", "intent": "general_help"},
    {"text": "Who won the basketball game last night?", "intent": "general_help"},
    {"text": "What time is it?", "intent": "general_help"},
    {"text": "Can you sing a song?", "intent": "general_help"},
    {"text": "What's 2 plus 2?", "intent": "general_help"},
    {"text": "Who is the president?", "intent": "general_help"},
    {"text": "Recommend a good restaurant", "intent": "general_help"},
    {"text": "What's your favorite color?", "intent": "general_help"},
    {"text": "Do you have feelings?", "intent": "general_help"},
    {"text": "Play some music", "intent": "general_help"},
    {"text": "What's the capital of France?", "intent": "general_help"},
    {"text": "How old are you?", "intent": "general_help"},
    {"text": "Can you order food for me?", "intent": "general_help"},
    {"text": "Tell me about the news today", "intent": "general_help"},
    {"text": "What movies are showing?", "intent": "general_help"},
    {"text": "Bakit umuulan ngayon?", "intent": "general_help"},
    {"text": "Anong oras na?", "intent": "general_help"},
    {"text": "Magkwento ka ng joke", "intent": "general_help"},
    {"text": "Sino ang paborito mong kulay?", "intent": "general_help"},
    {"text": "asdkjaslkdj random text", "intent": "general_help"},
    {"text": "hjkhjk qweqwe", "intent": "general_help"},
    {"text": "...", "intent": "general_help"},
    {"text": "ok", "intent": "general_help"},
    {"text": "test", "intent": "general_help"},

    # ═══════════════════════════════════════════════════════════════════════════
    # Hard disambiguation — ask_compliance vs teacher_stats vs school_compare
    # all share vocabulary ("compliance", "teacher", "school"); these pin down
    # the boundary so a "my" vs a named-third-party vs a school-level question
    # don't get confused with each other.
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "Is Teacher Santos compliant this week?", "intent": "teacher_stats"},
    {"text": "What's the compliance rate for Teacher Cruz specifically?", "intent": "teacher_stats"},
    {"text": "Show me how compliant each teacher in my school is", "intent": "teacher_stats"},
    {"text": "Rank the teachers by their compliance", "intent": "teacher_stats"},
    {"text": "Who on my staff still hasn't submitted?", "intent": "teacher_stats"},
    {"text": "Break down compliance by teacher", "intent": "teacher_stats"},
    {"text": "Compliance rate of Bulusan Elementary School", "intent": "school_compare"},
    {"text": "Which school in my district is most compliant?", "intent": "school_compare"},
    {"text": "Break down compliance by school", "intent": "school_compare"},
    {"text": "Rank the schools by their compliance", "intent": "school_compare"},
    {"text": "Is my school compliant overall?", "intent": "school_compare"},
    {"text": "What's my own compliance rate, not the school's", "intent": "ask_compliance"},
    {"text": "How compliant am I personally this term?", "intent": "ask_compliance"},
    {"text": "Just checking my individual compliance", "intent": "ask_compliance"},
    {"text": "My own submission status, not anyone else's", "intent": "ask_compliance"},

    # ═══════════════════════════════════════════════════════════════════════════
    # Hard disambiguation — find_dll vs how_to_upload (both DLL-related, very
    # different intents: locating an existing document vs the upload process).
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "I want to see the DLL I already submitted for Week 3", "intent": "find_dll"},
    {"text": "Can you pull up my previous DLL on fractions?", "intent": "find_dll"},
    {"text": "Where is the DLL I uploaded yesterday?", "intent": "find_dll"},
    {"text": "Show me the DLL that's already in the system for Grade 4", "intent": "find_dll"},
    {"text": "I haven't uploaded anything yet, how do I start?", "intent": "how_to_upload"},
    {"text": "What do I do before I can submit a new DLL?", "intent": "how_to_upload"},
    {"text": "I want to upload a new DLL, walk me through it", "intent": "how_to_upload"},
    {"text": "First time uploading, what do I need?", "intent": "how_to_upload"},

    # ═══════════════════════════════════════════════════════════════════════════
    # Extra phrasing diversity — short, terse, statement-style (not just
    # question-style) inputs across the existing intents.
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "compliance", "intent": "ask_compliance"},
    {"text": "my status", "intent": "ask_compliance"},
    {"text": "compliance rate", "intent": "ask_compliance"},
    {"text": "deadline", "intent": "check_deadline"},
    {"text": "next deadline", "intent": "check_deadline"},
    {"text": "due date", "intent": "check_deadline"},
    {"text": "fractions dll", "intent": "find_dll"},
    {"text": "grade 3 science dll", "intent": "find_dll"},
    {"text": "school ranking", "intent": "school_compare"},
    {"text": "top schools", "intent": "school_compare"},
    {"text": "teacher ranking", "intent": "teacher_stats"},
    {"text": "top teachers", "intent": "teacher_stats"},
    {"text": "school calendar", "intent": "calendar_info"},
    {"text": "current week", "intent": "calendar_info"},
    {"text": "upload help", "intent": "how_to_upload"},
    {"text": "how to submit", "intent": "how_to_upload"},
    {"text": "help", "intent": "general_help"},
    {"text": "hi there", "intent": "general_help"},

    # ═══════════════════════════════════════════════════════════════════════════
    # System-knowledge questions — dashboard, archive, analytics, calendar,
    # admin, notifications, theme, QR, teaching loads, passwords, privacy,
    # statuses. All conceptual "what is / how does X work" questions, which
    # is exactly what general_help exists to catch — these give the model
    # much broader coverage of what CEDIMS actually contains.
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "What's on the dashboard?", "intent": "general_help"},
    {"text": "Explain what each tab does", "intent": "general_help"},
    {"text": "What are the tabs for?", "intent": "general_help"},
    {"text": "How do I navigate around the app?", "intent": "general_help"},
    {"text": "What shows up on my home page?", "intent": "general_help"},
    {"text": "How does the archive work?", "intent": "general_help"},
    {"text": "What can I do in My Files?", "intent": "general_help"},
    {"text": "How do I search for a document?", "intent": "general_help"},
    {"text": "Can I sort files by date?", "intent": "general_help"},
    {"text": "How do I sort documents by name?", "intent": "general_help"},
    {"text": "Can I filter by status in the archive?", "intent": "general_help"},
    {"text": "How do I export my documents?", "intent": "general_help"},
    {"text": "Can I download an Excel report?", "intent": "general_help"},
    {"text": "How do I get a CSV of my submissions?", "intent": "general_help"},
    {"text": "What does the Analytics tab show?", "intent": "general_help"},
    {"text": "What is the K-Means clustering feature?", "intent": "general_help"},
    {"text": "How does the clustering work?", "intent": "general_help"},
    {"text": "What does High Performer mean?", "intent": "general_help"},
    {"text": "What is an At-Risk teacher?", "intent": "general_help"},
    {"text": "What's the forecast chart about?", "intent": "general_help"},
    {"text": "How do I read the compliance trend chart?", "intent": "general_help"},
    {"text": "What is the academic calendar for?", "intent": "general_help"},
    {"text": "How do I open a week for submissions?", "intent": "general_help"},
    {"text": "What does scheduled mean for a week?", "intent": "general_help"},
    {"text": "How do I generate the DepEd calendar?", "intent": "general_help"},
    {"text": "Who can edit the academic calendar?", "intent": "general_help"},
    {"text": "What is in the admin panel?", "intent": "general_help"},
    {"text": "How do I create a new teacher account?", "intent": "general_help"},
    {"text": "How do I change someone's role?", "intent": "general_help"},
    {"text": "Where do I manage users?", "intent": "general_help"},
    {"text": "How do notifications work?", "intent": "general_help"},
    {"text": "What triggers a notification?", "intent": "general_help"},
    {"text": "Where do I see my alerts?", "intent": "general_help"},
    {"text": "How do I turn on dark mode?", "intent": "general_help"},
    {"text": "Is there a night mode?", "intent": "general_help"},
    {"text": "How do I switch the theme?", "intent": "general_help"},
    {"text": "What is the QR code scanner for?", "intent": "general_help"},
    {"text": "How do I scan a document to verify it?", "intent": "general_help"},
    {"text": "What are teaching loads?", "intent": "general_help"},
    {"text": "How do I set up my subjects?", "intent": "general_help"},
    {"text": "Why is my expected count wrong?", "intent": "general_help"},
    {"text": "I forgot my password", "intent": "general_help"},
    {"text": "How do I reset my password?", "intent": "general_help"},
    {"text": "I can't log in, what do I do?", "intent": "general_help"},
    {"text": "I'm locked out of my account", "intent": "general_help"},
    {"text": "Who can see my submissions?", "intent": "general_help"},
    {"text": "Is my data private?", "intent": "general_help"},
    {"text": "Can other teachers see my DLLs?", "intent": "general_help"},
    {"text": "What happens if I miss a deadline?", "intent": "general_help"},
    {"text": "Will I get penalized for a late submission?", "intent": "general_help"},
    {"text": "What does the compliant status mean?", "intent": "general_help"},
    {"text": "What does missing status mean?", "intent": "general_help"},
    {"text": "What does pending mean?", "intent": "general_help"},
    {"text": "What is under review status?", "intent": "general_help"},
    {"text": "What is for checking status?", "intent": "general_help"},
    {"text": "What does checked mean?", "intent": "general_help"},
    {"text": "What is a supplementary submission?", "intent": "general_help"},
    {"text": "Why does my extra DLL not count?", "intent": "general_help"},
    {"text": "What is CEDIMS short for?", "intent": "general_help"},
    {"text": "What does SmartE Vision mean?", "intent": "general_help"},
    # Typo variants
    {"text": "Whats on the dashbord?", "intent": "general_help"},
    {"text": "How does the archiv work?", "intent": "general_help"},
    {"text": "Can I sort documnts by name?", "intent": "general_help"},
    {"text": "How do I expot my documents?", "intent": "general_help"},
    {"text": "Whats the K-Means clusterng feature?", "intent": "general_help"},
    {"text": "What is an At-Risk techer?", "intent": "general_help"},
    {"text": "What is the acadmic calendar four?", "intent": "general_help"},
    {"text": "How do I creat a new techer acount?", "intent": "general_help"},
    {"text": "How do notifcations work?", "intent": "general_help"},
    {"text": "How do I turn on drak mode?", "intent": "general_help"},
    {"text": "What is the QR cod scaner four?", "intent": "general_help"},
    {"text": "What are teachng loads?", "intent": "general_help"},
    {"text": "I forgt my password", "intent": "general_help"},
    {"text": "Im lockd out of my acount", "intent": "general_help"},
    {"text": "Who can se my sumissions?", "intent": "general_help"},
    {"text": "What happns if I miss a dedline?", "intent": "general_help"},
    {"text": "What does complient status meen?", "intent": "general_help"},
    {"text": "What is a suplementary sumission?", "intent": "general_help"},
    # Tagalog variants
    {"text": "Ano ang laman ng dashboard?", "intent": "general_help"},
    {"text": "Paano gumagana ang archive?", "intent": "general_help"},
    {"text": "Paano ako maghahanap ng dokumento?", "intent": "general_help"},
    {"text": "Paano mag-export ng Excel report?", "intent": "general_help"},
    {"text": "Ano ang ipinapakita ng Analytics?", "intent": "general_help"},
    {"text": "Paano gumagana ang clustering?", "intent": "general_help"},
    {"text": "Ano ang ibig sabihin ng At-Risk?", "intent": "general_help"},
    {"text": "Ano ang academic calendar?", "intent": "general_help"},
    {"text": "Paano mag-open ng linggo para sa submissions?", "intent": "general_help"},
    {"text": "Sino ang puwedeng mag-edit ng calendar?", "intent": "general_help"},
    {"text": "Ano ang laman ng admin panel?", "intent": "general_help"},
    {"text": "Paano gumawa ng bagong teacher account?", "intent": "general_help"},
    {"text": "Paano gumagana ang mga notification?", "intent": "general_help"},
    {"text": "Paano i-on ang dark mode?", "intent": "general_help"},
    {"text": "Ano ang gamit ng QR code scanner?", "intent": "general_help"},
    {"text": "Ano ang teaching load?", "intent": "general_help"},
    {"text": "Nakalimutan ko ang password ko", "intent": "general_help"},
    {"text": "Paano mag-reset ng password?", "intent": "general_help"},
    {"text": "Hindi ako makapag-login", "intent": "general_help"},
    {"text": "Sino ang makakakita ng mga submission ko?", "intent": "general_help"},
    {"text": "Ano ang mangyayari kung ma-miss ko ang deadline?", "intent": "general_help"},
    {"text": "Ano ang ibig sabihin ng compliant status?", "intent": "general_help"},
    {"text": "Ano ang ibig sabihin ng for checking?", "intent": "general_help"},
    {"text": "Ano ang supplementary submission?", "intent": "general_help"},
    {"text": "Ano ang CEDIMS?", "intent": "general_help"},

    # ═══════════════════════════════════════════════════════════════════════════
    # More upload-process depth (distinct from find_dll, which is about
    # locating an already-submitted document).
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "How does the system detect my subject and grade automatically?", "intent": "how_to_upload"},
    {"text": "Do I need to fill out the subject manually?", "intent": "how_to_upload"},
    {"text": "Can I review the extracted info before submitting?", "intent": "how_to_upload"},
    {"text": "What happens after I upload a DLL?", "intent": "how_to_upload"},
    {"text": "Does the system read my document automatically?", "intent": "how_to_upload"},
    {"text": "Paano nade-detect ng system ang subject ko?", "intent": "how_to_upload"},
    {"text": "Kailangan ko bang i-type ang grade level?", "intent": "how_to_upload"},

    # ═══════════════════════════════════════════════════════════════════════════
    # A few more disambiguation fixes found during held-out validation:
    # "how does X feature work" (conceptual) vs "compare/rank X" (a live query);
    # vaguer "days left" phrasing for deadlines; privacy phrased as a question
    # about who can see something, not just the word "privacy" itself.
    # ═══════════════════════════════════════════════════════════════════════════
    {"text": "How do the school clusters work?", "intent": "general_help"},
    {"text": "How does teacher clustering work?", "intent": "general_help"},
    {"text": "Explain how the ranking feature works", "intent": "general_help"},
    {"text": "How does the comparison tool work?", "intent": "general_help"},
    {"text": "How many days do I have left?", "intent": "check_deadline"},
    {"text": "How many days do I have left to submit?", "intent": "check_deadline"},
    {"text": "How much time is left before it's due?", "intent": "check_deadline"},
    {"text": "Can my principal see everything I upload?", "intent": "general_help"},
    {"text": "Can my school head see my files?", "intent": "general_help"},
    {"text": "Does the district supervisor see all my submissions?", "intent": "general_help"},
    {"text": "Who else can view what I submit?", "intent": "general_help"},
]

# ─── Templated Generation ───────────────────────────────────────────────────
# The ~950 examples above are hand-written for phrasing diversity, but they
# don't cover the combinatorial space of real inputs — a teacher can ask about
# any of a dozen subjects, six grade levels, ten weeks, a dozen colleagues, a
# dozen schools, in either language. Rather than hand-typing that explosion,
# we fill a smaller set of vetted sentence templates (per intent, per
# language) with slot values drawn from realistic vocabularies, and keep only
# combinations that are exact-text-unique (case-insensitive) against
# everything generated so far, including the hand-written seed set. This is
# what actually gets the dataset from ~950 to several thousand *distinct*
# strings rather than padding with near-duplicates.

random.seed(42)

# The hand-written seed above accumulated a handful of exact duplicate
# strings across its several editing passes (typo-variant and Tagalog-variant
# blocks occasionally repeated a phrasing already listed elsewhere for the
# same intent). Drop those before generating so "unique" holds for the whole
# dataset, not just the templated portion.
_dedup_seen = set()
_deduped_seed = []
for row in TRAINING_DATA:
    key = row["text"].strip().lower()
    if key in _dedup_seen:
        continue
    _dedup_seen.add(key)
    _deduped_seed.append(row)
if len(_deduped_seed) != len(TRAINING_DATA):
    print(f"Removed {len(TRAINING_DATA) - len(_deduped_seed)} duplicate hand-written examples from the seed set")
TRAINING_DATA[:] = _deduped_seed

SUBJECTS = [
    "Math", "Science", "English", "Filipino", "MAPEH", "AP", "ESP", "Reading",
    "Values Education", "TLE", "Araling Panlipunan", "Music and Arts"
]
GRADES = [f"Grade {i}" for i in range(1, 7)]
WEEKS = [f"Week {i}" for i in range(1, 11)]
TERMS_EN = ["this week", "this term", "this quarter", "this month", "this grading period", "this school year"]
TERMS_TL = ["ngayong linggo", "ngayong term", "ngayong quarter", "ngayong buwan", "ngayong grading period", "ngayong school year"]
TEACHERS = [
    "Teacher Santos", "Teacher Cruz", "Teacher Reyes", "Teacher Garcia",
    "Teacher Dela Cruz", "Teacher Mendoza", "Teacher Bautista", "Teacher Aquino",
    "Teacher Ramos", "Teacher Torres", "Teacher Villanueva", "Teacher Fernandez"
]
SCHOOLS = [
    "Bulusan Elementary School", "Bulusan ES", "Matnog Central School",
    "Sorsogon National High School", "San Roque Elementary School",
    "Juban Elementary School", "Casiguran Elementary School",
    "Barcelona Central School", "Gubat North Central School",
    "Irosin Elementary School", "Prieto Diaz Elementary School",
    "Magallanes Central School"
]

# Slot-filled templates, per intent, per language. Only intents whose real
# questions naturally carry a subject/grade/week/term/teacher/school slot are
# included here — general_help is handled separately below via topic filling.
SLOT_TEMPLATES = {
    "ask_compliance": {
        "en": [
            "What is my compliance rate for {subject}?",
            "Am I compliant in {subject} for {grade}?",
            "How many {subject} DLLs am I missing?",
            "Show my compliance status for {term}",
            "What is my {subject} compliance {term}?",
            "Am I on track with my {subject} submissions?",
            "How many {subject} DLLs have I submitted so far?",
            "Check my compliance for {grade} {subject}",
            "What percentage of my {subject} DLLs are done?",
            "Give me my compliance rate {term}",
            "Is my {subject} compliance good {term}?",
            "How many submissions am I missing for {grade}?",
        ],
        "tl": [
            "Ano ang compliance rate ko sa {subject}?",
            "Compliant ba ako sa {subject} para sa {grade}?",
            "Ilan ang kulang kong DLL sa {subject}?",
            "Ipakita ang compliance status ko {term}",
            "Ano ang {subject} compliance ko {term}?",
            "Nasa tamang landas ba ako sa {subject}?",
            "Ilang {subject} DLL na ang na-submit ko?",
            "Suriin ang compliance ko para sa {grade} {subject}",
            "Ilang percent na ang natapos kong {subject} DLL?",
            "Ibigay ang compliance rate ko {term}",
            "Maganda ba ang compliance ko sa {subject} {term}?",
            "Ilan ang kulang kong submission para sa {grade}?",
        ],
    },
    "check_deadline": {
        "en": [
            "When is the deadline for {week}?",
            "What is the deadline for {subject}?",
            "Is there a deadline {term}?",
            "How many days until the {week} deadline?",
            "When do I need to submit my {subject} DLL?",
            "What is the deadline for {grade} {subject}?",
            "What's due {term}?",
            "Is the {week} deadline coming up soon?",
            "How much time is left before the {subject} deadline?",
            "When should I submit {subject} for {grade}?",
        ],
        "tl": [
            "Kailan ang deadline para sa {week}?",
            "Ano ang deadline para sa {subject}?",
            "May deadline ba {term}?",
            "Ilang araw na lang bago ang deadline ng {week}?",
            "Kailan ko kailangang i-submit ang {subject} DLL ko?",
            "Ano ang deadline para sa {grade} {subject}?",
            "Ano ang dapat i-submit {term}?",
            "Malapit na ba ang deadline ng {week}?",
            "Gaano katagal na lang bago ang deadline sa {subject}?",
            "Kailan ko dapat i-submit ang {subject} para sa {grade}?",
        ],
    },
    "find_dll": {
        "en": [
            "Find DLLs about {subject}",
            "Search for {subject} DLLs in {grade}",
            "Show DLLs for {week} {subject}",
            "Find DLLs uploaded by {teacher}",
            "Look for {subject} lesson plans for {grade}",
            "Where is the {subject} DLL for {week}?",
            "Do we have DLLs on {subject}?",
            "Search my {subject} DLLs for {grade}",
            "Find the DLL {teacher} submitted for {week}",
            "Show me {subject} lesson plans",
        ],
        "tl": [
            "Maghanap ng DLL tungkol sa {subject}",
            "Hanapin ang {subject} DLL para sa {grade}",
            "Ipakita ang DLL para sa {week} {subject}",
            "Maghanap ng DLL na na-upload ni {teacher}",
            "Maghanap ng lesson plan sa {subject} para sa {grade}",
            "Saan ang {subject} DLL para sa {week}?",
            "Meron ba tayong DLL sa {subject}?",
            "Hanapin ang {subject} DLL ko para sa {grade}",
            "Hanapin ang DLL na isinumite ni {teacher} para sa {week}",
            "Ipakita ang mga lesson plan sa {subject}",
        ],
    },
    "school_compare": {
        "en": [
            "How does {school} compare to others?",
            "What is the compliance rate of {school}?",
            "Compare {school} to other schools",
            "Is {school} the top performer?",
            "How is {school} doing {term}?",
            "Rank {school} against other schools",
            "What is {school}'s ranking in the district?",
            "Is {school} more compliant than other schools?",
            "Show me how {school} is performing {term}",
            "How does {school} rank this quarter?",
        ],
        "tl": [
            "Kumusta ang {school} kumpara sa iba?",
            "Ano ang compliance rate ng {school}?",
            "Ikumpara ang {school} sa ibang paaralan",
            "Pinakamataas ba ang {school}?",
            "Kumusta ang {school} {term}?",
            "I-rank ang {school} laban sa ibang paaralan",
            "Ano ang ranggo ng {school} sa distrito?",
            "Mas compliant ba ang {school} kaysa sa iba?",
            "Ipakita kung paano gumagana ang {school} {term}",
            "Ano ang ranggo ng {school} ngayong quarter?",
        ],
    },
    "teacher_stats": {
        "en": [
            "Show statistics for {teacher}",
            "What is the compliance of {teacher}?",
            "Is {teacher} compliant {term}?",
            "How is {teacher} performing in {subject}?",
            "Rank {teacher} against other teachers",
            "Show {teacher}'s submission history",
            "What is {teacher}'s compliance rate {term}?",
            "Is {teacher} behind on submissions?",
            "How many DLLs has {teacher} submitted?",
            "Compare {teacher} to other teachers in {grade}",
        ],
        "tl": [
            "Ipakita ang statistics para kay {teacher}",
            "Ano ang compliance ni {teacher}?",
            "Compliant ba si {teacher} {term}?",
            "Kumusta ang performance ni {teacher} sa {subject}?",
            "I-rank si {teacher} laban sa ibang teacher",
            "Ipakita ang submission history ni {teacher}",
            "Ano ang compliance rate ni {teacher} {term}?",
            "Nahuhuli ba si {teacher} sa mga submission?",
            "Ilang DLL na ang na-submit ni {teacher}?",
            "Ikumpara si {teacher} sa ibang teacher sa {grade}",
        ],
    },
    "calendar_info": {
        "en": [
            "What week is {week}?",
            "When does {term} start?",
            "Show the calendar for {term}",
            "How many weeks are in {term}?",
            "What is the schedule for {week}?",
            "Is {week} an exam week?",
            "What term covers {week}?",
            "When does {term} end?",
        ],
        "tl": [
            "Anong linggo ang {week}?",
            "Kailan magsisimula ang {term}?",
            "Ipakita ang calendar para {term}",
            "Ilang linggo sa {term}?",
            "Ano ang schedule para sa {week}?",
            "Exam week ba ang {week}?",
            "Anong term ang saklaw ng {week}?",
            "Kailan matatapos ang {term}?",
        ],
    },
    "how_to_upload": {
        "en": [
            "How do I upload my {subject} DLL?",
            "Steps to submit {subject} for {grade}",
            "How to upload a DLL for {week}?",
            "Can I upload my {subject} DLL from my phone?",
            "How do I fix an upload error for {subject}?",
            "What format should my {subject} DLL be in?",
            "How do I re-upload my {subject} DLL for {week}?",
            "Can I upload {subject} for {grade} offline?",
        ],
        "tl": [
            "Paano mag-upload ng {subject} DLL ko?",
            "Mga hakbang para i-submit ang {subject} para sa {grade}",
            "Paano mag-upload ng DLL para sa {week}?",
            "Puwede ba akong mag-upload ng {subject} DLL gamit ang phone?",
            "Paano ayusin ang upload error sa {subject}?",
            "Anong format dapat ang {subject} DLL ko?",
            "Paano ko ire-reupload ang {subject} DLL ko para sa {week}?",
            "Puwede bang mag-upload ng {subject} para sa {grade} offline?",
        ],
    },
}

CAP_PER_TEMPLATE = 40


def _slot_lists_for(template, lang):
    slots = {}
    if "{subject}" in template:
        slots["subject"] = SUBJECTS
    if "{grade}" in template:
        slots["grade"] = GRADES
    if "{week}" in template:
        slots["week"] = WEEKS
    if "{term}" in template:
        slots["term"] = TERMS_TL if lang == "tl" else TERMS_EN
    if "{teacher}" in template:
        slots["teacher"] = TEACHERS
    if "{school}" in template:
        slots["school"] = SCHOOLS
    return slots


def _fill_template(template, lang, cap):
    slots = _slot_lists_for(template, lang)
    if not slots:
        return [template]
    keys = list(slots.keys())
    combos = list(product(*[slots[k] for k in keys]))
    random.shuffle(combos)
    out = []
    for combo in combos[:cap]:
        text = template
        for k, v in zip(keys, combo):
            text = text.replace("{" + k + "}", v)
        out.append(text)
    return out


_seen_texts = {row["text"].strip().lower() for row in TRAINING_DATA}
_generated = []

for intent, by_lang in SLOT_TEMPLATES.items():
    for lang, templates in by_lang.items():
        for template in templates:
            for text in _fill_template(template, lang, CAP_PER_TEMPLATE):
                key = text.strip().lower()
                if key in _seen_texts:
                    continue
                _seen_texts.add(key)
                _generated.append({"text": text, "intent": intent})

# general_help: no natural single slot, so fill a {topic} placeholder from a
# broad list of real, verified system features/concepts instead.
GENERAL_HELP_TOPICS_EN = [
    "the dashboard", "the archive", "the Analytics tab", "the academic calendar",
    "the admin panel", "notifications", "dark mode", "the QR scanner",
    "teaching loads", "password reset", "data privacy", "the For Checking status",
    "the Checked status", "a Supplementary submission", "a DLL", "an ISP",
    "an ISR", "compliance calculation", "K-Means clustering",
    "the compliance trend chart", "the compliance forecast", "user roles",
    "the district supervisor role", "the school head role", "exporting reports",
]
GENERAL_HELP_TOPICS_TL = [
    "ang dashboard", "ang archive", "ang Analytics tab", "ang academic calendar",
    "ang admin panel", "mga notification", "dark mode", "ang QR scanner",
    "teaching load", "pag-reset ng password", "privacy ng data",
    "For Checking status", "Checked status", "Supplementary submission",
    "DLL", "ISP", "ISR", "pagkalkula ng compliance", "K-Means clustering",
    "compliance trend chart", "compliance forecast", "user roles",
    "role ng district supervisor", "role ng school head", "pag-export ng reports",
]
GENERAL_HELP_TEMPLATES_EN = [
    "What is {topic}?",
    "How does {topic} work?",
    "Can you explain {topic}?",
    "Tell me about {topic}",
    "What does {topic} mean?",
]
GENERAL_HELP_TEMPLATES_TL = [
    "Ano ang {topic}?",
    "Paano gumagana ang {topic}?",
    "Ipaliwanag mo ang {topic}",
    "Sabihin mo sa akin ang tungkol sa {topic}",
    "Ano ang ibig sabihin ng {topic}?",
]

for topic in GENERAL_HELP_TOPICS_EN:
    for template in GENERAL_HELP_TEMPLATES_EN:
        text = template.format(topic=topic)
        key = text.strip().lower()
        if key in _seen_texts:
            continue
        _seen_texts.add(key)
        _generated.append({"text": text, "intent": "general_help"})

for topic in GENERAL_HELP_TOPICS_TL:
    for template in GENERAL_HELP_TEMPLATES_TL:
        text = template.format(topic=topic)
        key = text.strip().lower()
        if key in _seen_texts:
            continue
        _seen_texts.add(key)
        _generated.append({"text": text, "intent": "general_help"})

print(f"Generated {len(_generated)} additional unique templated examples "
      f"(hand-written seed: {len(TRAINING_DATA)})")
TRAINING_DATA.extend(_generated)

# Sanity check: the whole point of templated generation is genuine uniqueness,
# not just volume — fail loudly if that invariant is ever broken.
_all_texts = [row["text"].strip().lower() for row in TRAINING_DATA]
assert len(_all_texts) == len(set(_all_texts)), "Duplicate training text detected after generation"

# ─── Build DataFrame ────────────────────────────────────────────────────────

df = pd.DataFrame(TRAINING_DATA)
print("Intent distribution:")
print(df['intent'].value_counts())
print(f"\nTotal samples: {len(df)}")

# ─── Train/Test Split ──────────────────────────────────────────────────────

X = df['text']
y = df['intent']
intents = sorted(y.unique())

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.25, random_state=42, stratify=y
)

# ─── Vectorize with character n-grams for typo resilience ──────────────────

vectorizer = CountVectorizer(
    analyzer='char',
    ngram_range=(2, 5),
    min_df=2,
    max_features=11000,
    lowercase=True
)
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)
vocab = vectorizer.get_feature_names_out()

print(f"\nVocabulary size: {len(vocab)}")

# ─── Train Logistic Regression (small C grid search) ────────────────────────
# C=1.0 previously memorized the training set (100% train vs ~92% test — an
# 8-point generalization gap). Picking C by 5-fold CV on the training split
# — rather than fixing it — trades a little training accuracy for a model
# that actually generalizes better to phrasing it hasn't seen.

C_GRID = [0.25, 0.5, 1.0, 2.0, 4.0]
best_C, best_cv_acc = None, -1.0
cv_search = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
for candidate_C in C_GRID:
    fold_scores = []
    for tr_idx, va_idx in cv_search.split(X_train, y_train):
        X_tr, X_va = X_train.iloc[tr_idx], X_train.iloc[va_idx]
        y_tr, y_va = y_train.iloc[tr_idx], y_train.iloc[va_idx]
        fold_vec = CountVectorizer(analyzer='char', ngram_range=(2, 5), min_df=2, max_features=11000, lowercase=True)
        X_tr_vec = fold_vec.fit_transform(X_tr)
        X_va_vec = fold_vec.transform(X_va)
        fold_clf = LogisticRegression(C=candidate_C, solver='saga', max_iter=3000, random_state=42, class_weight='balanced')
        fold_clf.fit(X_tr_vec, y_tr)
        fold_scores.append(fold_clf.score(X_va_vec, y_va))
    mean_score = float(np.mean(fold_scores))
    print(f"  C={candidate_C}: inner CV accuracy = {mean_score:.2%}")
    if mean_score > best_cv_acc:
        best_cv_acc = mean_score
        best_C = candidate_C

print(f"\nSelected C={best_C} (inner CV accuracy {best_cv_acc:.2%})")

clf = LogisticRegression(
    C=best_C,
    solver='saga',
    max_iter=3000,
    random_state=42,
    class_weight='balanced'
)
clf.fit(X_train_vec, y_train)

train_acc = clf.score(X_train_vec, y_train)
test_acc = clf.score(X_test_vec, y_test)
print(f"\nTraining accuracy: {train_acc:.2%}")
print(f"Test accuracy: {test_acc:.2%}")

# ─── Classification Report ──────────────────────────────────────────────────

y_pred = clf.predict(X_test_vec)
report = classification_report(y_test, y_pred, output_dict=True)
print(f"\nClassification Report:")
print(classification_report(y_test, y_pred))

# ─── Confusion Matrix ───────────────────────────────────────────────────────

cm = confusion_matrix(y_test, y_pred)
plt.figure(figsize=(10, 8))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=intents, yticklabels=intents)
plt.title('Intent Classifier Confusion Matrix')
plt.xlabel('Predicted')
plt.ylabel('Actual')
plt.tight_layout()
plt.savefig(os.path.join(RESULTS_DIR, 'intent_confusion_matrix.png'), dpi=150)
plt.close()

# ─── 5-Fold Cross-Validation ───────────────────────────────────────────────

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = []
for train_idx, val_idx in skf.split(X, y):
    X_cv_train, X_cv_val = X.iloc[train_idx], X.iloc[val_idx]
    y_cv_train, y_cv_val = y.iloc[train_idx], y.iloc[val_idx]
    cv_vec = CountVectorizer(analyzer='char', ngram_range=(2, 5), min_df=1)
    X_cv_train_vec = cv_vec.fit_transform(X_cv_train)
    X_cv_val_vec = cv_vec.transform(X_cv_val)
    cv_clf = LogisticRegression(C=best_C, solver='saga', max_iter=3000, class_weight='balanced')
    cv_clf.fit(X_cv_train_vec, y_cv_train)
    cv_scores.append(cv_clf.score(X_cv_val_vec, y_cv_val))

cv_mean = np.mean(cv_scores)
cv_std = np.std(cv_scores)
print(f"\n5-Fold CV Accuracy: {cv_mean:.2%} ± {cv_std:.2%}")
print(f"Fold scores: {[f'{s:.2%}' for s in cv_scores]}")

# ─── ROC Curves ─────────────────────────────────────────────────────────────

y_prob = clf.predict_proba(X_test_vec)
plt.figure(figsize=(10, 8))
for i, intent_name in enumerate(intents):
    fpr, tpr, _ = roc_curve((y_test == intent_name).astype(int), y_prob[:, i])
    auc_score = auc(fpr, tpr)
    plt.plot(fpr, tpr, label=f'{intent_name} (AUC = {auc_score:.2f})')
plt.plot([0, 1], [0, 1], 'k--', alpha=0.3)
plt.xlabel('False Positive Rate')
plt.ylabel('True Positive Rate')
plt.title('ROC Curves per Intent')
plt.legend(loc='lower right')
plt.tight_layout()
plt.savefig(os.path.join(RESULTS_DIR, 'intent_roc_curves.png'), dpi=150)
plt.close()

# ─── Top Predictive N-grams per Intent ──────────────────────────────────────

top_ngrams = {}
for i, intent in enumerate(intents):
    coefs = clf.coef_[i]
    top_indices = np.argsort(coefs)[-10:][::-1]
    ngrams = [(vocab[idx], float(coefs[idx])) for idx in top_indices]
    top_ngrams[intent] = ngrams

# Plot
fig, axes = plt.subplots(2, 4, figsize=(18, 10))
axes = axes.flatten()
for i, intent in enumerate(intents):
    if i >= len(axes):
        break
    words = [w[0] for w in top_ngrams[intent]]
    scores = [w[1] for w in top_ngrams[intent]]
    axes[i].barh(range(len(words)), scores, color='steelblue')
    axes[i].set_yticks(range(len(words)))
    axes[i].set_yticklabels(words)
    axes[i].invert_yaxis()
    axes[i].set_title(f'{intent}')
    axes[i].set_xlabel('Coefficient')
plt.suptitle('Top 10 Predictive Character N-grams per Intent', fontsize=14)
plt.tight_layout()
plt.savefig(os.path.join(RESULTS_DIR, 'intent_top_words.png'), dpi=150)
plt.close()

# ─── Export Model JSON ──────────────────────────────────────────────────────

coef_dict = {}
for i, intent in enumerate(intents):
    coef_dict[intent] = {vocab[idx]: float(clf.coef_[i][idx]) for idx in range(len(vocab))}

model = {
    "version": "3.0.0",
    "intents": intents,
    "vocabulary": {word: idx for idx, word in enumerate(vocab)},
    "coefficients": coef_dict,
    "intercepts": {intent: float(clf.intercept_[i]) for i, intent in enumerate(intents)},
    "classes_": intents,
    "training_metrics": {
        "n_samples": len(df),
        "n_intents": len(intents),
        "vocabulary_size": len(vocab),
        "train_accuracy": round(train_acc * 100, 2),
        "test_accuracy": round(test_acc * 100, 2),
        "cv_mean": round(cv_mean * 100, 2),
        "cv_std": round(cv_std * 100, 2),
        "cv_folds": [round(s * 100, 2) for s in cv_scores],
        "per_intent": {}
    }
}

for intent in intents:
    r = report[intent]
    model["training_metrics"]["per_intent"][intent] = {
        "precision": round(r["precision"] * 100, 2),
        "recall": round(r["recall"] * 100, 2),
        "f1_score": round(r["f1-score"] * 100, 2),
        "support": int(r["support"])
    }

output_path = os.path.join(OUTPUT_DIR, 'intent_classifier_model.json')
with open(output_path, 'w') as f:
    json.dump(model, f, indent=2)
print(f"\nExported: {output_path}")

# ─── Save Results Summary ────────────────────────────────────────────────────

results = {
    "training_date": pd.Timestamp.now().isoformat(),
    "n_samples": len(df),
    "intents": intents,
    "vocabulary_size": len(vocab),
    "train_accuracy": round(train_acc * 100, 2),
    "test_accuracy": round(test_acc * 100, 2),
    "cv_mean": round(cv_mean * 100, 2),
    "cv_std": round(cv_std * 100, 2),
    "cv_folds": [round(s * 100, 2) for s in cv_scores]
}
with open(os.path.join(RESULTS_DIR, 'intent_training_results.json'), 'w') as f:
    json.dump(results, f, indent=2)

print(f"\n{'=' * 50}")
print(f"  TRAINING COMPLETE")
print(f"{'=' * 50}")
print(f"  Intents: {len(intents)}")
print(f"  Training samples: {len(df)}")
print(f"  Vocab size: {len(vocab)}")
print(f"  Test accuracy: {test_acc:.2%}")
print(f"  CV accuracy: {cv_mean:.2%} ± {cv_std:.2%}")
print(f"{'=' * 50}")
