from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
TEMP = Path(r"C:\Users\ASUS\AppData\Local\Temp")
OUT = ROOT / "SMART-E_Vision_Tri-Fold_Outside.png"
IN = ROOT / "SMART-E_Vision_Tri-Fold_Inside.png"
PREVIEW = ROOT / "SMART-E_Vision_Tri-Fold_Preview.png"
W, H = 3508, 2480
PW = W // 3
NAVY, BLUE, GOLD = "#153B79", "#2452C3", "#E7A137"
INK, MUTED = "#18263B", "#596B80"
PAPER, PALE, WHITE = "#F7F8F5", "#EEF2F8", "#FFFFFF"
LINE, GREEN, RED = "#D8E0E9", "#13805C", "#C84C4C"
REG = r"C:\Windows\Fonts\segoeui.ttf"
BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
SEAL = ROOT / "static" / "deped-calapan-east-district.jpg"
SRC = {
    "load": TEMP / "codex-clipboard-5042f6f8-2110-4af9-9319-98a20614c8c3.png",
    "tracker": TEMP / "codex-clipboard-a5fa6c35-908b-4af0-aea3-eff2c8ad58a8.png",
    "upload": TEMP / "codex-clipboard-5c5aee04-f312-4d46-a290-066c7f8cc18d.png",
    "receipt": TEMP / "codex-clipboard-c6d4b650-03b6-4102-91a1-f69582f32d76.png",
    "remark": TEMP / "codex-clipboard-854f6e5f-4021-4192-a1d3-c4cdd2534537.png",
    "review": TEMP / "codex-clipboard-8b2a6362-51b1-4d5b-87ca-7f2f32f72927.png",
    "school": TEMP / "codex-clipboard-ed7e4c45-b574-4363-a9d8-e2364130d254.png",
    "district": TEMP / "codex-clipboard-7c616264-eeee-4cc6-ad03-86e63564d2d5.png",
    "analytics": TEMP / "codex-clipboard-91db503e-3c36-44f4-9c84-8428cf0d1158.png",
    "teacher_list": TEMP / "codex-clipboard-0f13bbc4-7cdb-40dc-8c6b-e357d33c902b.png",
    "archives": TEMP / "codex-clipboard-f12f3dd2-326a-4605-b20e-df2a17a98aff.png",
    "calendar": TEMP / "codex-clipboard-607f218c-1248-4d6e-a351-457b9a60fcda.png",
    "users": TEMP / "codex-clipboard-ca6fb67b-a955-4a71-85d3-5fabab965b80.png",
    "gabay": TEMP / "codex-clipboard-eb86be9a-0fae-46b6-93f1-95442e549ca9.png",
}
for key, path in {**SRC, "seal": SEAL}.items():
    if not path.exists():
        raise FileNotFoundError(f"Missing {key} screenshot: {path}")


def font(sz, bold=False):
    return ImageFont.truetype(BOLD if bold else REG, sz)


def wrap(draw, text, ft, width):
    out, line = [], ""
    for word in text.split():
        trial = word if not line else line + " " + word
        if draw.textlength(trial, font=ft) <= width:
            line = trial
        else:
            if line:
                out.append(line)
            line = word
    if line:
        out.append(line)
    return out


def para(draw, xy, text, size=29, color=INK, width=980, leading=7, bold=False):
    x, y = xy
    ft = font(size, bold)
    for line in wrap(draw, text, ft, width):
        draw.text((x, y), line, font=ft, fill=color)
        y += size + leading
    return y


def rounded(draw, box, fill, outline=None, radius=24, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill,
                           outline=outline or fill, width=width)


def shadow_card(canvas, box, fill=WHITE, outline=LINE, radius=24):
    x1, y1, x2, y2 = box
    shade = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    sd.rounded_rectangle((x1 + 3, y1 + 9, x2 + 3, y2 + 9), radius=radius,
                         fill=(26, 47, 82, 25))
    shade = shade.filter(ImageFilter.GaussianBlur(10))
    canvas.paste(shade, (0, 0), shade)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, fill=fill,
                                               outline=outline, width=2)


def tag(draw, xy, text, fill="#E7EDFA", color=NAVY, size=22):
    x, y = xy
    ft = font(size, True)
    w = int(draw.textlength(text, font=ft)) + 30
    h = size + 22
    rounded(draw, (x, y, x + w, y + h), fill, fill, 16, 1)
    draw.text((x + 15, y + 7), text, font=ft, fill=color)
    return w, h


def heading(draw, xy, text, size=54, color=NAVY, width=1000):
    return para(draw, xy, text, size, color, width, 6, True)


def image_panel(canvas, key, box, crop=None, contain=True, radius=18, redact=None):
    x1, y1, x2, y2 = box
    tw, th = x2 - x1, y2 - y1
    source = Image.open(SRC[key]).convert("RGB")
    if crop:
        source = source.crop(crop)
    if redact:
        rd = ImageDraw.Draw(source)
        for mask in redact:
            rd.rounded_rectangle(mask, radius=6, fill="#FFFFFF")
    if contain:
        fitted = ImageOps.contain(source, (tw, th), Image.Resampling.LANCZOS)
        frame = Image.new("RGB", (tw, th), WHITE)
        frame.paste(fitted, ((tw - fitted.width) // 2, (th - fitted.height) // 2))
    else:
        frame = ImageOps.fit(source, (tw, th), Image.Resampling.LANCZOS)
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw - 1, th - 1), radius=radius, fill=255)
    canvas.paste(frame, (x1, y1), mask)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, outline=LINE, width=3)


def panel_header(draw, x, label, title, sub, accent=BLUE):
    draw.rounded_rectangle((x + 56, 62, x + 71, 110), radius=7, fill=accent)
    draw.text((x + 93, 62), label.upper(), font=font(22, True), fill=accent)
    y = heading(draw, (x + 56, 132), title, 54, NAVY, 1040)
    return para(draw, (x + 58, y + 12), sub, 28, MUTED, 1030, 6)


def footer(draw, side):
    draw.text((60, H - 132), "Screens show capture-time examples; live counts and dates can change.",
              font=font(18), fill=MUTED)
    draw.line((55, H - 102, W - 55, H - 102), fill=LINE, width=2)
    draw.text((60, H - 78), "SMART-E VISION   /   Calapan East District Instructional Monitoring System",
              font=font(22, True), fill=MUTED)
    draw.text((W - 480, H - 78), side.upper() + "  •  A4 TRI-FOLD", font=font(21, True), fill=MUTED)


def start_side(backgrounds):
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)
    for i, color in enumerate(backgrounds):
        x = i * PW
        d.rectangle((x, 0, x + PW, H), fill=color)
        if i:
            d.line((x, 0, x, H), fill="#C8D2E1", width=3)
    return canvas, d


def outside_flap(canvas, d):
    x, w = 55, PW - 110
    y = panel_header(d, x, "Quick start", "A clear path from upload to follow-up",
                     "SMART-E Vision supports a consistent district workflow.")
    y += 30
    flow = [
        ("01", "SET UP", "Admin creates authorized accounts and opens the right school-year, term, and week."),
        ("02", "PREPARE", "Teachers confirm their grade/subject teaching loads and check Tracker."),
        ("03", "SUBMIT", "Select an Open period; review suggested file details before confirming."),
        ("04", "REVIEW", "Master Teachers and School Heads inspect work and leave useful remarks."),
        ("05", "MONITOR", "School and district roles follow progress; Archives keep the records."),
    ]
    for i, (number, label, body) in enumerate(flow):
        yy = y + i * 226
        d.ellipse((x + 6, yy + 3, x + 67, yy + 64), fill=BLUE if i < 3 else GOLD)
        d.text((x + 18, yy + 15), number, font=font(25, True), fill=WHITE)
        d.text((x + 91, yy), label, font=font(25, True), fill=NAVY)
        para(d, (x + 91, yy + 40), body, 24, INK, w - 118, 5)
        if i < 4:
            d.line((x + 37, yy + 68, x + 37, yy + 205), fill="#C9D5E7", width=3)
    by = y + 5 * 226 + 8
    shadow_card(canvas, (x, by, x + w, by + 340), "#EAF0FB", "#D6E0F0", 23)
    d = ImageDraw.Draw(canvas)
    d.text((x + 24, by + 22), "WHO DOES WHAT", font=font(24, True), fill=NAVY)
    roles = [
        ("Teacher", "Prepare + submit"),
        ("Master Teacher", "Review + remark"),
        ("School Head", "School follow-up"),
        ("District Supervisor", "District monitoring"),
        ("Admin", "Accounts + calendar"),
    ]
    for i, (role, work) in enumerate(roles):
        yy = by + 76 + i * 49
        d.text((x + 26, yy), role, font=font(22, True), fill=INK)
        d.text((x + 380, yy), work, font=font(21), fill=MUTED)
    ry = by + 368
    shadow_card(canvas, (x, ry, x + w, ry + 410), WHITE, LINE, 23)
    d = ImageDraw.Draw(canvas)
    d.text((x + 24, ry + 20), "A FEW IMPORTANT RULES", font=font(24, True), fill=NAVY)
    rules = [
        "Only Open weekly periods accept new DLL/DLP uploads.",
        "Closing a period keeps existing files and review history.",
        "Supplementary uploads have no separate weekly deadline.",
        "ISP/ISR are archived, not counted as weekly compliance.",
    ]
    for i, text in enumerate(rules):
        yy = ry + 75 + i * 77
        d.ellipse((x + 27, yy + 8, x + 45, yy + 26), fill=GOLD if i > 1 else BLUE)
        para(d, (x + 62, yy), text, 22, INK, w - 92, 4)


def outside_back(canvas, d):
    x, w = PW + 55, PW - 110
    y = panel_header(d, x, "Back panel", "Records made easier to find",
                     "Browse by school, teacher, grade, subject, term, and week.")
    y += 25
    tag(d, (x, y), "REAL ARCHIVES INTERFACE")
    y += 54
    image_panel(canvas, "archives", (x, y, x + w, y + 500), redact=[(930, 171, 1190, 205)])
    d = ImageDraw.Draw(canvas)
    y += 520
    # Labels shown in the archive are compact, unmistakable chips.
    chips = [("For Checking", "#FFF1D7", "#995A00"), ("Checked", "#E4F5ED", GREEN),
             ("Compliant", "#E4F5ED", GREEN), ("Supplementary", "#E8EEFF", BLUE)]
    for i, (label, bg, fg) in enumerate(chips):
        col, row = i % 2, i // 2
        tag(d, (x + col * 505, y + row * 58), label, bg, fg, 21)
    y += 135
    shadow_card(canvas, (x, y, x + w, y + 440), WHITE, LINE, 23)
    d = ImageDraw.Draw(canvas)
    image_panel(canvas, "gabay", (x + 18, y + 24, x + 328, y + 416))
    d = ImageDraw.Draw(canvas)
    d.text((x + 350, y + 28), "GABAY  /  CEDIMS ASSISTANT", font=font(23, True), fill=NAVY)
    para(d, (x + 350, y + 70), "An intent classifier routes English or Tagalog questions into 9 support topics:", 21, INK, 660, 5)
    intents = [
        "General help • Find a DLL • Compliance questions",
        "Teacher statistics • Deadline checks • Upload guidance",
        "School comparisons • Report requests • Calendar information",
    ]
    for i, text in enumerate(intents):
        para(d, (x + 350, y + 151 + i * 48), text, 19, BLUE, 660, 3, True)
    para(d, (x + 350, y + 310), "A character n-gram Logistic Regression model classifies the intent; Gabay then answers from CEDIMS guidance and role-scoped live data where available. It is not generative AI.", 19, MUTED, 660, 4)
    y += 465
    shadow_card(canvas, (x, y, x + w, y + 700), "#F0F4FB", "#D9E2EE", 23)
    d = ImageDraw.Draw(canvas)
    d.text((x + 22, y + 20), "VERIFY AN ARCHIVED DOCUMENT", font=font(23, True), fill=NAVY)
    image_panel(canvas, "receipt", (x + 22, y + 68, x + 450, y + 655))
    d = ImageDraw.Draw(canvas)
    d.text((x + 478, y + 92), "QR AUTHENTICITY CHECK", font=font(22, True), fill=BLUE)
    para(d, (x + 478, y + 132), "Scan the code to open this archived file’s verification page.", 22, INK, 530, 6)
    d.text((x + 478, y + 270), "SHA-256 FILE FINGERPRINT", font=font(22, True), fill=BLUE)
    para(d, (x + 478, y + 310), "A digital fingerprint helps detect whether a file has changed. It is not encryption and does not, by itself, prove uploader identity.", 22, INK, 530, 6)
    rounded(d, (x + 478, y + 505, x + w - 22, y + 650), WHITE, LINE, 16, 2)
    d.text((x + 498, y + 530), "Browse by school, teacher, subject, grade,", font=font(19, True), fill=MUTED)
    d.text((x + 498, y + 563), "term, and week. Open or download records", font=font(19, True), fill=MUTED)
    d.text((x + 498, y + 596), "according to your role permissions.", font=font(19, True), fill=MUTED)


def outside_cover(canvas, d):
    x = 2 * PW
    d.rectangle((x, 0, x + PW, H), fill=NAVY)
    d.ellipse((x + 876, 74, x + 1210, 408), fill="#1E4A91")
    d.ellipse((x + 946, 145, x + 1138, 337), fill="#2B5BAC")
    seal = Image.open(SEAL).convert("RGB")
    seal = ImageOps.contain(seal, (270, 270), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (290, 290), WHITE)
    tile.paste(seal, ((290 - seal.width) // 2, (290 - seal.height) // 2))
    canvas.paste(tile, (x + 64, 72))
    d = ImageDraw.Draw(canvas)
    tag(d, (x + 64, 406), "CALAPAN EAST DISTRICT", "#E2EAFA", NAVY, 20)
    d.text((x + 62, 495), "SMART-E", font=font(90, True), fill=WHITE)
    d.text((x + 62, 595), "VISION", font=font(93, True), fill="#F1B64E")
    para(d, (x + 66, 725), "CALAPAN EAST DISTRICT INSTRUCTIONAL MONITORING SYSTEM", 27, "#E5EBF6", 1020, 5, True)
    para(d, (x + 66, 835), "Clearer submissions. Useful review. District-wide visibility.", 31, WHITE, 1010, 7)
    # Feature rows replace a dense wall of text and balance the cover.
    features = [
        ("01", "ONE WORKFLOW", "Tracker • Upload • Review • Archives"),
        ("02", "FIVE ROLE SCOPES", "Teacher • MT • School Head • District • Admin"),
        ("03", "HUMAN-LED AI", "Smart suggestions; people verify and decide."),
    ]
    for i, (num, title, body) in enumerate(features):
        yy = 1010 + i * 196
        d.line((x + 68, yy, x + 1088, yy), fill="#47679B", width=2)
        d.text((x + 70, yy + 28), num, font=font(22, True), fill="#F1B64E")
        d.text((x + 142, yy + 22), title, font=font(27, True), fill=WHITE)
        d.text((x + 142, yy + 68), body, font=font(23), fill="#DCE5F4")
    rounded(d, (x + 65, 1660, x + 1090, 1945), "#204780", "#4970AB", 25, 2)
    d.text((x + 94, 1692), "BUILT FOR INSTRUCTIONAL FOLLOW-THROUGH", font=font(23, True), fill="#F1B64E")
    para(d, (x + 94, 1748), "Open/Closed academic-calendar periods guide weekly DLL/DLP uploads. Supplementary files, ISP, and ISR remain outside weekly Missing/Late/Compliant calculations.", 25, WHITE, 930, 7)
    d.text((x + 68, 2015), "SMART-E Vision is the capstone title. CEDIMS is its deployment name.",
           font=font(23, True), fill="#DCE5F4")
    d.text((x + 68, 2084), "A practical digital workflow for Calapan East District schools.",
           font=font(24), fill="#DCE5F4")


def inside_teacher(canvas, d):
    x, w = 55, PW - 110
    y = panel_header(d, x, "Teacher + Master Teacher", "Prepare. Track. Submit.",
                     "Start with a correct teaching load and the period shown in Tracker.")
    y += 18
    # Give each real task screen almost the full printable panel width.
    tag(d, (x, y), "01  SUBMISSION TRACKER")
    y += 48
    image_panel(canvas, "tracker", (x, y, x + w, y + 460))
    d = ImageDraw.Draw(canvas)
    y += 473
    tag(d, (x, y), "02  SET OR CHECK YOUR TEACHING LOAD")
    y += 48
    image_panel(canvas, "load", (x, y, x + w, y + 570))
    d = ImageDraw.Draw(canvas)
    y += 582
    tag(d, (x, y), "03  REVIEW DETECTED DETAILS, THEN UPLOAD", "#E5F4EC", GREEN)
    y += 48
    image_panel(canvas, "upload", (x, y, x + w, y + 610))
    d = ImageDraw.Draw(canvas)
    y += 625
    rounded(d, (x, y, x + w, y + 190), "#EDF7F2", "#D6EADF", 20, 2)
    d.text((x + 20, y + 14), "SMART PREFILL  /  FUZZY MATCHING, HUMAN CONFIRMATION", font=font(21, True), fill=GREEN)
    para(d, (x + 20, y + 52), "Filename patterns take priority. OCR plus regex detects common subject, grade, term, week/day, and document-type tokens. For unclear text, Dice-coefficient bigram matching compares subjects, terms, document types, and field labels with known values to help handle spelling/OCR noise. It is deterministic fuzzy matching, not trained ML. Verify suggestions before archiving; only Open weekly DLL/DLP periods accept new uploads.", 20, INK, w - 40, 4)


def inside_review(canvas, d):
    x, w = PW + 55, PW - 110
    y = panel_header(d, x, "Master Teacher + School Head", "Review with purpose",
                     "Work within your assigned school scope; reviewers retain the final judgment.", GOLD)
    y += 18
    tag(d, (x, y), "01  REVIEW TRACKER  /  FILTER YOUR QUEUE", "#FFF1D8", "#895400", 20)
    y += 48
    image_panel(canvas, "review", (x, y, x + w, y + 430), crop=(0, 0, 1771, 714))
    d = ImageDraw.Draw(canvas)
    y += 445
    tag(d, (x, y), "02  SCHOOL COMPLIANCE VIEW", "#FFF1D8", "#895400", 20)
    y += 48
    image_panel(canvas, "school", (x, y, x + w, y + 470), crop=(0, 0, 1885, 829))
    d = ImageDraw.Draw(canvas)
    y += 483
    tag(d, (x, y), "03  TEACHER FOLLOW-UP LIST", "#FFF1D8", "#895400", 20)
    y += 48
    image_panel(canvas, "teacher_list", (x, y, x + w, y + 440), redact=[(48, 188, 720, 252), (48, 332, 720, 397), (48, 478, 720, 544), (48, 624, 720, 690)])
    d = ImageDraw.Draw(canvas)
    y += 453
    # A simple bottom strip keeps the remark action visible without shrinking the core review screens.
    image_panel(canvas, "remark", (x, y, x + 400, y + 245))
    d = ImageDraw.Draw(canvas)
    d.text((x + 423, y + 18), "WRITE A USEFUL REMARK", font=font(23, True), fill=NAVY)
    para(d, (x + 423, y + 59), "Describe the issue and give a clear next step. Gabay can answer workflow questions; reviewers make the judgment.", 21, INK, 610, 5)
    y += 258
    rounded(d, (x, y, x + w, y + 178), "#EEF3FB", "#DCE4F0", 18, 2)
    d.text((x + 18, y + 12), "GABAY AI  /  DIGITAL COMPANION", font=font(21, True), fill=NAVY)
    para(d, (x + 18, y + 48), "Supervised character n-gram Logistic Regression routes questions to 9 intents—not generative AI. Project report: 6,786 English/Filipino examples, 11,000 features, 75/25 split and 5-fold CV. Preliminary 98.53% test accuracy; independent template-separated validation is still needed.", 19, INK, w - 36, 3)


def inside_district(canvas, d):
    x, w = 2 * PW + 55, PW - 110
    y = panel_header(d, x, "District Supervisor + Admin", "See the district picture",
                     "Monitor trends while account and calendar controls stay role-restricted.")
    y += 18
    tag(d, (x, y), "01  DISTRICT COMPLIANCE DASHBOARD")
    y += 48
    image_panel(canvas, "district", (x, y, x + w, y + 520), crop=(0, 0, 1884, 873))
    d = ImageDraw.Draw(canvas)
    y += 533
    tag(d, (x, y), "02  ANALYTICS + K-MEANS PATTERN GROUPS")
    y += 48
    image_panel(canvas, "analytics", (x, y, x + w, y + 520), crop=(0, 0, 1882, 867))
    d = ImageDraw.Draw(canvas)
    y += 533
    tag(d, (x, y), "03  ADMIN CALENDAR + USER CONTROLS")
    y += 48
    image_panel(canvas, "calendar", (x, y, x + 600, y + 400), crop=(0, 100, 1650, 850))
    image_panel(canvas, "users", (x + 620, y, x + w, y + 400), crop=(0, 0, 630, 801))
    d = ImageDraw.Draw(canvas)
    d.text((x + 5, y + 408), "Set a week’s status + deadline", font=font(20, True), fill=MUTED)
    d.text((x + 625, y + 408), "Create account + assign role", font=font(20, True), fill=MUTED)
    y += 440
    rounded(d, (x, y, x + w, y + 300), "#EEF3FB", "#DCE4F0", 18, 2)
    d.text((x + 18, y + 14), "HOW TO READ THE ANALYTICS", font=font(21, True), fill=NAVY)
    para(d, (x + 18, y + 51), "K-means groups schools by patterns such as punctuality, consistency, completeness, and upload volume. The groups guide follow-up; they are not staff ratings or automated decisions. District and school dashboards summarize compliance; Admin manages users, calendar periods, and system logs.", 20, INK, w - 36, 4)


def build_side(inside=False):
    if inside:
        canvas, d = start_side([WHITE, "#F5F6F2", WHITE])
        inside_teacher(canvas, d)
        inside_review(canvas, d)
        inside_district(canvas, d)
        footer(d, "INSIDE")
    else:
        canvas, d = start_side(["#F5F6F2", WHITE, PAPER])
        outside_flap(canvas, d)
        outside_back(canvas, d)
        outside_cover(canvas, d)
        footer(d, "OUTSIDE")
    # Subtle dotted fold marks remain printable and do not intrude on text.
    d = ImageDraw.Draw(canvas)
    for fold in (PW, 2 * PW):
        for yy in range(35, H - 150, 28):
            d.line((fold, yy, fold, yy + 9), fill="#BAC6D6", width=1)
    return canvas


def build_preview(outside, inside):
    tw, th = 1754, int(H * 1754 / W)
    gap, label = 32, 76
    preview = Image.new("RGB", (tw * 2 + gap, th + label), "#E5EAF1")
    d = ImageDraw.Draw(preview)
    for i, (title, img) in enumerate((("OUTSIDE  •  flap / back / cover", outside),
                                      ("INSIDE  •  left-to-right", inside))):
        x = i * (tw + gap)
        d.rectangle((x, 0, x + tw, label), fill=NAVY)
        d.text((x + 20, 18), title, font=font(25, True), fill=WHITE)
        preview.paste(img.resize((tw, th), Image.Resampling.LANCZOS), (x, label))
    return preview


outside = build_side(False)
inside = build_side(True)
outside.save(OUT, "PNG", dpi=(300, 300), optimize=True)
inside.save(IN, "PNG", dpi=(300, 300), optimize=True)
build_preview(outside, inside).save(PREVIEW, "PNG", optimize=True)
print("\n".join(map(str, (OUT, IN, PREVIEW))))
