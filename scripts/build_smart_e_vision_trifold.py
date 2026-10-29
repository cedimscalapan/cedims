from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
TEMP = Path(r"C:\Users\ASUS\AppData\Local\Temp")
OUTSIDE_PATH = ROOT / "SMART-E_Vision_Tri-Fold_Outside.png"
INSIDE_PATH = ROOT / "SMART-E_Vision_Tri-Fold_Inside.png"
PREVIEW_PATH = ROOT / "SMART-E_Vision_Tri-Fold_Preview.png"

# A4 landscape at 300 dpi.
W, H = 3508, 2480
PW = W // 3
NAVY, BLUE = "#153B8F", "#2449B8"
INK, MUTED = "#17243A", "#53657E"
PALE, WHITE = "#F3F6FC", "#FFFFFF"
LINE, GREEN, GOLD, RED = "#D6E0F0", "#128052", "#D98413", "#C43D3D"
FONT_REG = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

SRC = {
    "load": TEMP / "codex-clipboard-5042f6f8-2110-4af9-9319-98a20614c8c3.png",
    "tracker": TEMP / "codex-clipboard-a5fa6c35-908b-4af0-aea3-eff2c8ad58a8.png",
    "upload_review": TEMP / "codex-clipboard-5c5aee04-f312-4d46-a290-066c7f8cc18d.png",
    "receipt": TEMP / "codex-clipboard-c6d4b650-03b6-4102-91a1-f69582f32d76.png",
    "remark": TEMP / "codex-clipboard-854f6e5f-4021-4192-a1d3-c4cdd2534537.png",
    "review": TEMP / "codex-clipboard-8b2a6362-51b1-4d5b-87ca-7f2f32f72927.png",
    "school_compliance": TEMP / "codex-clipboard-ed7e4c45-b574-4363-a9d8-e2364130d254.png",
    "district_compliance": TEMP / "codex-clipboard-7c616264-eeee-4cc6-ad03-86e63564d2d5.png",
    "district_analytics": TEMP / "codex-clipboard-91db503e-3c36-44f4-9c84-8428cf0d1158.png",
    "teacher_action": TEMP / "codex-clipboard-0f13bbc4-7cdb-40dc-8c6b-e357d33c902b.png",
    "archives": TEMP / "codex-clipboard-f12f3dd2-326a-4605-b20e-df2a17a98aff.png",
    "calendar": TEMP / "codex-clipboard-607f218c-1248-4d6e-a351-457b9a60fcda.png",
    "users": TEMP / "codex-clipboard-ca6fb67b-a955-4a71-85d3-5fabab965b80.png",
    "gabay": TEMP / "codex-clipboard-eb86be9a-0fae-46b6-93f1-95442e549ca9.png",
    "seal": ROOT / "static" / "deped-calapan-east-district.jpg",
}

for name, path in SRC.items():
    if not path.exists():
        raise FileNotFoundError(f"Missing source asset {name}: {path}")


def f(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def rounded(draw, box, fill=WHITE, outline=LINE, radius=24, width=3):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw, text, font, max_width):
    lines, line = [], ""
    for word in text.split():
        trial = word if not line else f"{line} {word}"
        if draw.textlength(trial, font=font) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def para(draw, xy, text, size=38, color=INK, max_width=980, leading=8, bold=False):
    x, y = xy
    ft = f(size, bold)
    for line in wrap(draw, text, ft, max_width):
        draw.text((x, y), line, font=ft, fill=color)
        y += size + leading
    return y


def title(draw, xy, text, max_width=995, size=64):
    return para(draw, xy, text, size, NAVY, max_width, 8, True)


def pill(draw, xy, text, fill="#E8EEFF", color=NAVY, size=27, pad_x=18, pad_y=11):
    x, y = xy
    ft = f(size, True)
    width = int(draw.textlength(text, font=ft)) + pad_x * 2
    height = size + pad_y * 2
    rounded(draw, (x, y, x + width, y + height), fill, fill, 18, 1)
    draw.text((x + pad_x, y + pad_y - 2), text, font=ft, fill=color)
    return width, height


def card(draw, box, fill=WHITE, outline=LINE, radius=24):
    rounded(draw, box, fill, outline, radius, 3)


def panel_canvas():
    return Image.new("RGB", (W, H), PALE)


def panel_start(draw, index, background=WHITE):
    x0 = index * PW
    draw.rectangle((x0, 0, x0 + PW, H), fill=background)
    draw.rectangle((x0, 0, x0 + 13, H), fill=BLUE)
    return x0 + 66


def fold_guides(draw):
    for x in (PW, 2 * PW):
        for y in range(60, H - 55, 26):
            draw.line((x, y, x, min(y + 10, H - 55)), fill="#BECADF", width=2)


def footer(draw, side):
    draw.line((50, H - 104, W - 50, H - 104), fill=LINE, width=2)
    draw.text((62, H - 137), "Dashboard figures and dates in supplied screenshots are capture-time examples.", font=f(18), fill=MUTED)
    draw.text((62, H - 82), "SMART-E VISION  |  Calapan East District Instructional Monitoring System", font=f(24, True), fill=MUTED)
    draw.text((W - 510, H - 82), f"{side}  •  A4 TRI-FOLD", font=f(23, True), fill=MUTED)


def screenshot(target_canvas, draw, target, key, crop=None, fit=True, redact=None, radius=18):
    source = Image.open(SRC[key]).convert("RGB")
    if crop:
        source = source.crop(crop)
    if redact:
        rd = ImageDraw.Draw(source)
        for box in redact:
            rd.rounded_rectangle(box, radius=7, fill="#F8FAFD")
            rd.line((box[0] + 8, (box[1] + box[3]) // 2, box[2] - 8, (box[1] + box[3]) // 2), fill="#A8B4C7", width=3)
    x1, y1, x2, y2 = target
    tw, th = x2 - x1, y2 - y1
    if fit:
        source = ImageOps.contain(source, (tw, th), Image.Resampling.LANCZOS)
        frame = Image.new("RGB", (tw, th), WHITE)
        frame.paste(source, ((tw - source.width) // 2, (th - source.height) // 2))
    else:
        frame = ImageOps.fit(source, (tw, th), Image.Resampling.LANCZOS)
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw - 1, th - 1), radius=radius, fill=255)
    target_canvas.paste(frame, (x1, y1), mask)
    draw.rounded_rectangle(target, radius=radius, outline=LINE, width=3)


def caption(draw, xy, label, width):
    x, y = xy
    rounded(draw, (x, y, x + width, y + 49), "#E8EEFF", "#E8EEFF", 14, 1)
    draw.text((x + 15, y + 8), label.upper(), font=f(23, True), fill=NAVY)


def bullet(draw, xy, text, max_width, color=INK, dot=BLUE, size=31):
    x, y = xy
    draw.ellipse((x, y + 12, x + 14, y + 26), fill=dot)
    return para(draw, (x + 28, y), text, size, color, max_width - 28, 6)


def outside_side():
    canvas = panel_canvas()
    d = ImageDraw.Draw(canvas)
    # Outside left: quick journey and concise role map.
    x = panel_start(d, 0, PALE)
    pill(d, (x, 58), "QUICK START", "#E8EEFF", NAVY, 25)
    y = title(d, (x, 130), "From setup to a verified record", 1000, 58) + 18
    y = para(d, (x, y), "A guided workflow for Calapan East District instructional monitoring.", 34, MUTED, 1000, 8)
    y += 24
    flow = [
        ("01", "ADMIN SETUP", "Create authorized accounts and open the correct school year, term, and week."),
        ("02", "PREPARE", "Teachers verify grade/subject teaching loads and check what is expected in Tracker."),
        ("03", "UPLOAD", "Choose an Open period, check suggested details, correct if needed, then confirm."),
        ("04", "REVIEW", "Master Teachers and School Heads inspect files and add actionable remarks."),
        ("05", "MONITOR + KEEP", "School and district roles follow compliance; Archives retain records."),
    ]
    for num, heading, copy in flow:
        card(d, (x, y, x + 1000, y + 226), WHITE, LINE, 22)
        rounded(d, (x + 20, y + 22, x + 91, y + 93), "#E8EEFF", "#E8EEFF", 18, 1)
        d.text((x + 33, y + 35), num, font=f(27, True), fill=BLUE)
        d.text((x + 116, y + 21), heading, font=f(28, True), fill=GOLD if num == "04" else NAVY)
        para(d, (x + 116, y + 65), copy, 29, INK, 840, 7)
        y += 241
    card(d, (x, y + 2, x + 1000, y + 292), "#EAF0FF", "#D3DFFF", 22)
    d.text((x + 22, y + 20), "WHO DOES WHAT", font=f(27, True), fill=NAVY)
    roles = [
        ("Teacher", "Prepare + submit"),
        ("Master Teacher", "Review + remark"),
        ("School Head", "School follow-up"),
        ("District Supervisor", "District monitor"),
        ("Admin", "Accounts + calendar"),
    ]
    for i, (role, task) in enumerate(roles):
        col, row = i % 2, i // 2
        rx, ry = x + 20 + col * 485, y + 67 + row * 68
        d.text((rx, ry), role, font=f(24, True), fill=INK)
        d.text((rx + 245, ry), task, font=f(22), fill=MUTED)
    footer(d, "OUTSIDE")
    fold_guides(d)
    return canvas


def outside_middle(target_canvas, draw, x):
    pill(draw, (x, 58), "BACK PANEL", "#E8EEFF", NAVY, 24)
    y = title(draw, (x, 126), "Find and understand your records", 1000, 53) + 14
    y = para(draw, (x, y), "Archives organizes uploads by school, teacher, grade, subject, term, and week.", 32, MUTED, 1000, 7) + 16
    caption(draw, (x, y), "Real system screen  •  Archives", 1000)
    y += 60
    # Mask the breadcrumb's teacher name in the supplied screenshot.
    screenshot(target_canvas, draw, (x, y, x + 1000, y + 470), "archives", fit=True,
               redact=[(930, 171, 1190, 205)])
    y += 490
    y = bullet(draw, (x, y), "Use the folder path and period filters to reach the right school and week.", 960, size=29) + 7
    y = bullet(draw, (x, y), "Search filenames; check the labels; open, download, or share records using the available actions.", 960, size=29) + 17
    card(draw, (x, y, x + 1000, y + 230), "#F2F5FB", LINE, 22)
    draw.text((x + 20, y + 18), "ARCHIVE LABELS", font=f(25, True), fill=NAVY)
    labels = [("For Checking", GOLD), ("Checked", GREEN), ("Compliant", GREEN), ("Supplementary", BLUE)]
    for i, (word, color) in enumerate(labels):
        px = x + 22 + (i % 2) * 480
        py = y + 63 + (i // 2) * 70
        pill(draw, (px, py), word, "#FFFFFF", color, 23, 12, 8)
    y += 250
    card(draw, (x, y, x + 1000, y + 350), WHITE, LINE, 22)
    # Small genuine Gabay image alongside a short use description.
    screenshot(target_canvas, draw, (x + 22, y + 30, x + 280, y + 320), "gabay", fit=True)
    draw.text((x + 310, y + 26), "GABAY  |  CEDIMS ASSISTANT", font=f(26, True), fill=NAVY)
    para(draw, (x + 310, y + 74), "Ask about uploads, deadlines, compliance, Archives, remarks, and Daily Lesson Plans. Gabay supports English and Tagalog questions.", 29, INK, 660, 7)
    y += 370
    card(draw, (x, y, x + 1000, y + 460), "#FFF8EC", "#F0DEBE", 22)
    draw.text((x + 22, y + 18), "WHAT COUNTS IN WEEKLY COMPLIANCE?", font=f(25, True), fill="#925600")
    rounded(draw, (x + 20, y + 66, x + 486, y + 394), WHITE, LINE, 18, 2)
    rounded(draw, (x + 510, y + 66, x + 980, y + 394), WHITE, LINE, 18, 2)
    draw.text((x + 38, y + 83), "WEEKLY DLL / DLP", font=f(25, True), fill=NAVY)
    para(draw, (x + 38, y + 130), "Uses the configured academic-calendar period and deadline. Open periods accept new uploads; Closed periods preserve history and stop new uploads.", 25, INK, 414, 7)
    draw.text((x + 530, y + 83), "SUPPLEMENTARY  •  ISP / ISR", font=f(24, True), fill=GREEN)
    para(draw, (x + 530, y + 130), "Supplementary uploads have no separate deadline. ISP and ISR are administrative records. These do not create weekly Missing, Late, or Compliant results.", 25, INK, 420, 7)
    para(draw, (x + 24, y + 407), "QR opens the verification page; SHA-256 fingerprints file bytes. A hash is not encryption or proof of uploader identity.", 21, MUTED, 950, 3)
    return y + 480


def outside_cover(target_canvas, draw, x):
    # Crest appears once on the printed brochure.
    pill(draw, (x, 58), "CALAPAN EAST DISTRICT", "#E8EEFF", NAVY, 24)
    seal = Image.open(SRC["seal"]).convert("RGB")
    seal.thumbnail((300, 300), Image.Resampling.LANCZOS)
    # Paste the official district mark on a clean white tile.
    tile = Image.new("RGB", (340, 340), WHITE)
    tile.paste(seal, ((340 - seal.width) // 2, (340 - seal.height) // 2))
    target_canvas.paste(tile, (x + 330, 105))
    draw.text((x + 30, 500), "SMART-E", font=f(82, True), fill=NAVY)
    draw.text((x + 30, 590), "VISION", font=f(84, True), fill=GOLD)
    y = para(draw, (x + 30, 720), "CALAPAN EAST DISTRICT INSTRUCTIONAL MONITORING SYSTEM", 32, INK, 930, 7, True)
    y += 17
    y = para(draw, (x + 30, y), "A practical system for instructional submissions, review, compliance monitoring, and trusted records.", 31, MUTED, 930, 8)
    y += 26
    card(draw, (x + 30, y, x + 1000, y + 218), NAVY, NAVY, 24)
    draw.text((x + 58, y + 24), "FIVE ROLE SCOPES  •  CEDIMS IS THE DEPLOYMENT NAME", font=f(25, True), fill=WHITE)
    para(draw, (x + 58, y + 76), "Teacher  •  Master Teacher  •  School Head  •  District Supervisor  •  Admin", 26, "#E8EEFF", 910, 7)
    y += 244
    card(draw, (x + 30, y, x + 1000, y + 1000), "#EAF0FF", "#D3DFFF", 22)
    draw.text((x + 54, y + 20), "AI, TRAINING + TRACEABILITY  |  WITH HUMAN OVERSIGHT", font=f(24, True), fill=NAVY)
    # The genuine upload receipt makes the QR/hash explanation concrete.
    screenshot(target_canvas, draw, (x + 550, y + 70, x + 970, y + 770), "receipt", fit=True)
    draw.text((x + 572, y + 782), "REAL UPLOAD RECEIPT  •  QR + SHA-256", font=f(20, True), fill=NAVY)
    para(draw, (x + 572, y + 814), "A hash fingerprints file bytes; it is not encryption or proof of uploader identity.", 21, MUTED, 385, 4)
    draw.text((x + 55, y + 76), "GABAY  •  SUPERVISED INTENT MODEL", font=f(23, True), fill=NAVY)
    para(draw, (x + 55, y + 112), "Character n-gram Logistic Regression routes questions to 9 intents. It is not generative AI.", 25, INK, 455, 5)
    draw.text((x + 55, y + 250), "TRAINING SETUP", font=f(23, True), fill=NAVY)
    para(draw, (x + 55, y + 286), "6,786 bilingual authored/generated examples; 11,000 features; stratified 75/25 split and five-fold cross-validation.", 25, INK, 455, 5)
    draw.text((x + 55, y + 454), "PRELIMINARY EVALUATION", font=f(23, True), fill=RED)
    para(draw, (x + 55, y + 490), "98.53% held-out accuracy; 98.75% ± 0.34% CV. Template overlap could inflate scores; independent testing is needed.", 24, INK, 455, 5)
    draw.text((x + 55, y + 635), "OCR + FUZZY MATCHING", font=f(23, True), fill=NAVY)
    para(draw, (x + 55, y + 672), "Tesseract.js reads English/Filipino text. Regex runs first; Dice bigram similarity suggests likely metadata. It is not trained, and users verify the result.", 24, INK, 455, 5)
    draw.text((x + 55, y + 824), "K-MEANS  •  UNSUPERVISED", font=f(23, True), fill=NAVY)
    para(draw, (x + 55, y + 861), "Groups punctuality, consistency, completeness, and upload volume to guide follow-up—not to rate staff or decide outcomes.", 24, INK, 455, 5)


def make_outside():
    global canvas
    canvas = panel_canvas()
    d = ImageDraw.Draw(canvas)
    panel_start(d, 0, PALE)
    panel_start(d, 1, WHITE)
    panel_start(d, 2, PALE)
    outside_side_left(d)
    outside_middle(canvas, d, PW + 66)
    outside_cover(canvas, d, 2 * PW + 66)
    footer(d, "OUTSIDE")
    fold_guides(d)
    return canvas


def outside_side_left(d):
    x = 66
    pill(d, (x, 58), "QUICK START", "#E8EEFF", NAVY, 25)
    y = title(d, (x, 130), "From setup to a verified record", 1000, 58) + 18
    y = para(d, (x, y), "A guided workflow for Calapan East District instructional monitoring.", 34, MUTED, 1000, 8) + 24
    flow = [
        ("01", "ADMIN SETUP", "Create authorized accounts and open the correct school year, term, and week."),
        ("02", "PREPARE", "Teachers verify grade/subject teaching loads and check what is expected in Tracker."),
        ("03", "UPLOAD", "Choose an Open period, check suggested details, correct if needed, then confirm."),
        ("04", "REVIEW", "Master Teachers and School Heads inspect files and add actionable remarks."),
        ("05", "MONITOR + KEEP", "School and district roles follow compliance; Archives retain records."),
    ]
    for num, heading, copy in flow:
        card(d, (x, y, x + 1000, y + 226), WHITE, LINE, 22)
        rounded(d, (x + 20, y + 22, x + 91, y + 93), "#E8EEFF", "#E8EEFF", 18, 1)
        d.text((x + 33, y + 35), num, font=f(27, True), fill=BLUE)
        d.text((x + 116, y + 21), heading, font=f(28, True), fill=GOLD if num == "04" else NAVY)
        para(d, (x + 116, y + 65), copy, 29, INK, 840, 7)
        y += 241
    card(d, (x, y + 2, x + 1000, y + 292), "#EAF0FF", "#D3DFFF", 22)
    d.text((x + 22, y + 20), "WHO DOES WHAT", font=f(27, True), fill=NAVY)
    roles = [("Teacher", "Prepare + submit"), ("Master Teacher", "Review + remark"),
             ("School Head", "School follow-up"), ("District Supervisor", "District monitor"),
             ("Admin", "Accounts + calendar")]
    for i, (role, task) in enumerate(roles):
        col, row = i % 2, i // 2
        rx, ry = x + 20 + col * 485, y + 67 + row * 68
        d.text((rx, ry), role, font=f(24, True), fill=INK)
        d.text((rx + 245, ry), task, font=f(22), fill=MUTED)


def inside_left(canvas, d, x):
    pill(d, (x, 58), "TEACHER + MASTER TEACHER", "#E8EEFF", NAVY, 23)
    y = title(d, (x, 126), "Prepare, track, upload", 1000, 56) + 12
    y = para(d, (x, y), "Set the grade/subject load, check expected DLL/DLP work, then review the file details before confirming.", 31, MUTED, 1000, 7) + 14
    caption(d, (x, y), "Teaching load  |  Submission Tracker", 1000)
    y += 57
    screenshot(canvas, d, (x, y, x + 475, y + 255), "load", fit=True)
    screenshot(canvas, d, (x + 495, y, x + 1000, y + 255), "tracker", fit=True)
    d.text((x + 4, y + 262), "Add/verify grade and subject", font=f(23, True), fill=MUTED)
    d.text((x + 505, y + 262), "See expected, missing, leave, and submitted", font=f(21, True), fill=MUTED)
    y += 306
    caption(d, (x, y), "Upload review  |  Verify suggestions before archiving", 1000)
    y += 58
    screenshot(canvas, d, (x, y, x + 1000, y + 600), "upload_review", fit=True)
    y += 617
    card(d, (x, y, x + 1000, y + 325), "#EFF8F4", "#CFE9DB", 22)
    d.text((x + 22, y + 18), "UPLOAD SAFELY", font=f(27, True), fill=GREEN)
    bullet(d, (x + 22, y + 68), "Confirm the document type, teaching load, and period; the filename/OCR detector only suggests metadata.", 945, size=27)
    bullet(d, (x + 22, y + 150), "Only Open calendar periods are selectable for new weekly DLL/DLP uploads.", 945, size=27)
    bullet(d, (x + 22, y + 232), "Closed periods preserve existing records but stop accepting new uploads.", 945, size=27)
    y += 350
    card(d, (x, y, x + 1000, y + 500), WHITE, LINE, 22)
    d.text((x + 22, y + 20), "FILE-NAME DETECTION IS ASSISTIVE", font=f(27, True), fill=NAVY)
    para(d, (x + 22, y + 68), "Tesseract.js OCR reads English/Filipino document text. Regex handles known patterns first; a Dice-coefficient character-bigram matcher compares filename/OCR clues with subjects, grades, and document types. Fuzzy matching is not trained; it suggests values for a person to verify.", 26, INK, 950, 7)
    rounded(d, (x + 22, y + 226, x + 978, y + 460), "#EFF8F4", "#CFE9DB", 18, 2)
    d.text((x + 42, y + 244), "IMPORTANT", font=f(24, True), fill=GREEN)
    para(d, (x + 42, y + 285), "The classifier is not a final authority. Check the detected teaching load and calendar period yourself before confirming the upload.", 26, INK, 890, 7)


def inside_center(canvas, d, x):
    pill(d, (x, 58), "MASTER TEACHER + SCHOOL HEAD", "#FFF1D9", "#925600", 23)
    y = title(d, (x, 126), "Review, remark, follow up", 1000, 56) + 12
    y = para(d, (x, y), "Work within your assigned school scope. Reviewers make the final judgment; analytics help organize the queue.", 31, MUTED, 1000, 7) + 14
    caption(d, (x, y), "Review Tracker  |  date, teacher, grade, subject", 1000)
    y += 58
    # Crop to the review totals and filter controls, excluding teacher/file names.
    screenshot(canvas, d, (x, y, x + 1000, y + 385), "review", crop=(0, 0, 1771, 420), fit=True)
    y += 405
    screenshot(canvas, d, (x, y, x + 395, y + 260), "remark", fit=True)
    d.text((x + 420, y + 7), "A useful remark should", font=f(27, True), fill=NAVY)
    para(d, (x + 420, y + 52), "identify what needs attention, refer to the relevant document detail, and give the teacher a clear next step.", 28, INK, 570, 7)
    y += 280
    caption(d, (x, y), "School compliance  |  follow-up list", 1000)
    y += 58
    screenshot(canvas, d, (x, y, x + 490, y + 270), "school_compliance", crop=(0, 0, 1885, 829), fit=True)
    # Redact names in the teacher action screenshot while keeping status cards visible.
    screenshot(canvas, d, (x + 510, y, x + 1000, y + 270), "teacher_action", fit=True,
               redact=[(48, 188, 720, 252), (48, 332, 720, 397), (48, 478, 720, 544), (48, 624, 720, 690)])
    d.text((x + 7, y + 277), "School Head dashboard", font=f(23, True), fill=MUTED)
    d.text((x + 518, y + 277), "Teacher action list  •  names redacted", font=f(22, True), fill=MUTED)
    y += 315
    card(d, (x, y, x + 1000, y + 315), PALE, LINE, 22)
    d.text((x + 22, y + 18), "REVIEW CHECKLIST", font=f(26, True), fill=NAVY)
    checks = ["Open the correct file and verify its period/load.", "Write a specific, respectful remark.", "Check the status again after saving."]
    for i, text in enumerate(checks):
        cy = y + 72 + i * 72
        rounded(d, (x + 24, cy, x + 66, cy + 42), "#E8EEFF", "#E8EEFF", 12, 1)
        d.text((x + 37, cy + 6), str(i + 1), font=f(23, True), fill=BLUE)
        d.text((x + 84, cy + 7), text, font=f(25), fill=INK)
    y += 335
    card(d, (x, y, x + 1000, y + 370), WHITE, LINE, 22)
    d.text((x + 22, y + 20), "READ THE REVIEW STATUS CORRECTLY", font=f(26, True), fill=NAVY)
    status_notes = [
        ("For Checking", "Waiting for a reviewer’s assessment.", GOLD),
        ("Checked / With remarks", "Review was recorded; read the feedback and follow up as needed.", BLUE),
        ("Compliant", "On-time weekly DLL/DLP submission under the configured rules.", GREEN),
        ("Supplementary", "Additional upload for review; no separate due date.", NAVY),
    ]
    for i, (label, note, color) in enumerate(status_notes):
        sy = y + 70 + i * 62
        pill(d, (x + 24, sy), label, "#F3F6FC", color, 21, 13, 9)
        para(d, (x + 300, sy + 2), note, 22, INK, 670, 3)


def inside_right(canvas, d, x):
    pill(d, (x, 58), "DISTRICT SUPERVISOR + ADMIN", "#E8EEFF", NAVY, 23)
    y = title(d, (x, 126), "Monitor with the right scope", 1000, 56) + 12
    y = para(d, (x, y), "District Supervisors compare schools; Admins also manage accounts and calendar periods. Access follows assigned role.", 31, MUTED, 1000, 7) + 14
    caption(d, (x, y), "District Compliance  |  Analytics and K-means", 1000)
    y += 57
    screenshot(canvas, d, (x, y, x + 490, y + 285), "district_compliance", crop=(0, 0, 1884, 873), fit=True)
    screenshot(canvas, d, (x + 510, y, x + 1000, y + 285), "district_analytics", crop=(0, 0, 1882, 867), fit=True)
    d.text((x + 6, y + 291), "District compliance", font=f(23, True), fill=MUTED)
    d.text((x + 516, y + 291), "K-means groups + charts", font=f(23, True), fill=MUTED)
    y += 332
    y = bullet(d, (x, y), "District Supervisor: compare schools, monitor trends, and use available report exports.", 980, size=27) + 8
    y = bullet(d, (x, y), "Unsupervised K-means groups punctuality, consistency, completeness, and upload-volume patterns. Use clusters for follow-up only—not staff ratings or automated decisions.", 980, size=26) + 16
    caption(d, (x, y), "Admin Calendar  |  Create User", 1000)
    y += 58
    screenshot(canvas, d, (x, y, x + 600, y + 370), "calendar", crop=(0, 100, 1650, 850), fit=True)
    screenshot(canvas, d, (x + 620, y, x + 1000, y + 370), "users", crop=(0, 0, 630, 801), fit=True)
    d.text((x + 8, y + 377), "Open/Closed entries have configured deadlines.", font=f(22, True), fill=MUTED)
    d.text((x + 629, y + 377), "Role + school assignment", font=f(22, True), fill=MUTED)
    y += 420
    card(d, (x, y, x + 1000, y + 275), "#FFF8EC", "#F0DEBE", 22)
    d.text((x + 22, y + 18), "COMPLIANCE RULES AT A GLANCE", font=f(25, True), fill="#925600")
    para(d, (x + 22, y + 62), "DLL/DLP use the configured compliance period and deadline. Supplementary uploads have no separate deadline and do not create Missing/Late/Compliant results. ISP/ISR stay in Archives and are excluded from weekly compliance.", 26, INK, 950, 7)
    y += 295
    card(d, (x, y, x + 1000, y + 485), WHITE, LINE, 22)
    d.text((x + 22, y + 20), "ROLE-BASED RESPONSIBILITY", font=f(26, True), fill=NAVY)
    role_notes = [
        ("Teacher", "Maintain teaching loads; submit and check returned remarks."),
        ("Master Teacher", "Review assigned submissions and leave actionable feedback."),
        ("School Head", "Monitor school compliance and coordinate follow-up."),
        ("District Supervisor", "Review district-wide trends and school needs."),
        ("Admin", "Manage accounts and academic-calendar periods; preserve archive governance."),
    ]
    for i, (role, note) in enumerate(role_notes):
        sy = y + 72 + i * 78
        d.text((x + 26, sy), role, font=f(23, True), fill=BLUE)
        para(d, (x + 265, sy), note, 23, INK, 705, 4)


def make_inside():
    canvas = panel_canvas()
    d = ImageDraw.Draw(canvas)
    panel_start(d, 0, WHITE)
    panel_start(d, 1, PALE)
    panel_start(d, 2, WHITE)
    inside_left(canvas, d, 66)
    inside_center(canvas, d, PW + 66)
    inside_right(canvas, d, 2 * PW + 66)
    footer(d, "INSIDE")
    fold_guides(d)
    return canvas


def make_preview(outside, inside):
    thumb_w = 1754
    thumb_h = int(H * thumb_w / W)
    label_h = 74
    gap = 34
    preview = Image.new("RGB", (thumb_w * 2 + gap, thumb_h + label_h), "#E8EDF5")
    pd = ImageDraw.Draw(preview)
    for idx, (name, source) in enumerate((("OUTSIDE  •  left flap | back | front cover", outside),
                                          ("INSIDE  •  left-to-right reading order", inside))):
        x = idx * (thumb_w + gap)
        pd.rectangle((x, 0, x + thumb_w, label_h), fill=NAVY)
        pd.text((x + 20, 18), name, font=f(25, True), fill=WHITE)
        thumb = source.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        preview.paste(thumb, (x, label_h))
    return preview


outside = make_outside()
inside = make_inside()
preview = make_preview(outside, inside)

outside.save(OUTSIDE_PATH, "PNG", dpi=(300, 300), optimize=True)
inside.save(INSIDE_PATH, "PNG", dpi=(300, 300), optimize=True)
preview.save(PREVIEW_PATH, "PNG", optimize=True)
print("\n".join(str(p) for p in (OUTSIDE_PATH, INSIDE_PATH, PREVIEW_PATH)))
