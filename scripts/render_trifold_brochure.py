from PIL import Image, ImageDraw, ImageFont, ImageOps
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'SMART-E_Vision_Tri-Fold_Brochure.png'
W, H = 3300, 5100
PANEL_W, SIDE_H = 1100, 2550
NAVY = '#173B9A'
BLUE = '#2448BE'
PALE = '#F3F6FC'
INK = '#1E293B'
MUTED = '#53647C'
GOLD = '#E48A11'
GREEN = '#188457'
WHITE = '#FFFFFF'

FONT = r'C:\Windows\Fonts\arial.ttf'
FONT_B = r'C:\Windows\Fonts\arialbd.ttf'
def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size)

im = Image.new('RGB', (W, H), '#E9EEF7')
d = ImageDraw.Draw(im)

def rounded(box, fill, radius=28, outline=None, width=2):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def wrap(text, f, max_width):
    words = text.split()
    lines, line = [], ''
    for word in words:
        candidate = word if not line else line + ' ' + word
        if d.textlength(candidate, font=f) <= max_width:
            line = candidate
        else:
            if line: lines.append(line)
            line = word
    if line: lines.append(line)
    return lines

def paragraph(x, y, text, size=35, color=INK, max_width=930, leading=12, bold=False):
    f = font(size, bold)
    for line in wrap(text, f, max_width):
        d.text((x, y), line, font=f, fill=color)
        y += size + leading
    return y

def title(x, y, text, size=54, color=NAVY, max_width=930):
    f = font(size, True)
    for line in wrap(text, f, max_width):
        d.text((x, y), line, font=f, fill=color)
        y += size + 9
    return y

def bullet(x, y, text, size=33, color=INK, max_width=900, dot=BLUE):
    d.ellipse((x, y+11, x+17, y+28), fill=dot)
    return paragraph(x+34, y, text, size, color, max_width-34, 8)

def crop_image(path, box, crop=None, radius=20):
    src = Image.open(path).convert('RGB')
    if crop:
        src = src.crop(crop)
    target_w, target_h = box[2]-box[0], box[3]-box[1]
    src = ImageOps.fit(src, (target_w, target_h), method=Image.Resampling.LANCZOS)
    mask = Image.new('L', src.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target_w-1, target_h-1), radius=radius, fill=255)
    im.paste(src, (box[0], box[1]), mask)
    d.rounded_rectangle(box, radius=radius, outline='#D8E1F0', width=3)

def contain_image(path, box, background=WHITE, radius=20):
    src = Image.open(path).convert('RGB')
    target_w, target_h = box[2]-box[0], box[3]-box[1]
    src.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    card = Image.new('RGB', (target_w, target_h), background)
    card.paste(src, ((target_w-src.width)//2, (target_h-src.height)//2))
    mask = Image.new('L', card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target_w-1, target_h-1), radius=radius, fill=255)
    im.paste(card, (box[0], box[1]), mask)
    d.rounded_rectangle(box, radius=radius, outline='#D8E1F0', width=3)

def panel_bg(index, y0, color=WHITE):
    x0 = index * PANEL_W
    d.rectangle((x0, y0, x0+PANEL_W, y0+SIDE_H), fill=color)
    d.rectangle((x0, y0, x0+16, y0+SIDE_H), fill=BLUE)
    return x0 + 58, y0 + 70

def section_label(y, text):
    d.rectangle((0, y, W, y+90), fill=NAVY)
    d.text((68, y+17), text, font=font(42, True), fill=WHITE)
    d.text((W-900, y+27), 'SMART-E VISION  •  CEDIMS', font=font(27, True), fill='#DDE7FF')

def screenshot_tag(x, y, label, width=980):
    rounded((x, y, x+width, y+56), '#E8EEFF', 16)
    d.text((x+20, y+10), label, font=font(25, True), fill=NAVY)

src = {
    'teaching_load': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-5042f6f8-2110-4af9-9319-98a20614c8c3.png',
    'submission_tracker': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-a5fa6c35-908b-4af0-aea3-eff2c8ad58a8.png',
    'upload_review': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-5c5aee04-f312-4d46-a290-066c7f8cc18d.png',
    'upload_result': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-c6d4b650-03b6-4102-91a1-f69582f32d76.png',
    'remark': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-854f6e5f-4021-4192-a1d3-c4cdd2534537.png',
    'review_tracker': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-8b2a6362-51b1-4d5b-87ca-7f2f32f72927.png',
    'school_compliance': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-ed7e4c45-b574-4363-a9d8-e2364130d254.png',
    'teacher_compliance': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-0f13bbc4-7cdb-40dc-8c6b-e357d33c902b.png',
    'district_compliance': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-7c616264-eeee-4cc6-ad03-86e63564d2d5.png',
    'district_analytics': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-91db503e-3c36-44f4-9c84-8428cf0d1158.png',
    'calendar': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-607f218c-1248-4d6e-a351-457b9a60fcda.png',
    'user_creation': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-ca6fb67b-a955-4a71-85d3-5fabab965b80.png',
    'chatbot': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-eb86be9a-0fae-46b6-93f1-95442e549ca9.png',
    'archives': r'C:\Users\ASUS\AppData\Local\Temp\codex-clipboard-f12f3dd2-326a-4605-b20e-df2a17a98aff.png',
}

# OUTSIDE: left flap, back cover, front cover.
section_label(0, 'OUTSIDE PANELS  |  Fold the right panel inward first')
y0 = 90

# Fold-in flap: shared workflow.
x, y = panel_bg(0, y0, PALE)
y = title(x, y, 'One connected workflow', 56)
y = paragraph(x, y+18, 'SMART-E Vision brings instructional submissions, review, monitoring, and records together for Calapan East District.', 35, MUTED, 930, 13)
y += 38
steps = [
    ('01', 'SET UP', 'Admin creates user accounts, assigns school roles, and adds calendar periods.'),
    ('02', 'PREPARE', 'Teachers and Master Teachers maintain teaching loads and check what is expected.'),
    ('03', 'UPLOAD', 'Choose an Open week, verify the detected load and period, then submit the DLL/DLP.'),
    ('04', 'REVIEW', 'Master Teachers and School Heads inspect files, leave remarks, and track follow-up.'),
    ('05', 'MONITOR & KEEP', 'District Supervisors monitor district compliance; Archives preserve uploaded records.'),
]
for number, label, copy in steps:
    rounded((x, y, x+950, y+245), WHITE, 25, '#D9E2F2', 2)
    rounded((x+22, y+22, x+105, y+105), '#E8EEFF', 20)
    d.text((x+36, y+40), number, font=font(32, True), fill=BLUE)
    d.text((x+130, y+20), label, font=font(31, True), fill=GOLD if label == 'REVIEW' else NAVY)
    paragraph(x+130, y+72, copy, 28, INK, 785, 6)
    y += 263
paragraph(x, y+18, 'A Closed period stays in the historical record but is no longer selectable for new uploads.', 30, MUTED, 930, 8)
y += 130
rounded((x, y, x+950, y+650), '#EAF0FF', 28, '#D3DFFF', 2)
d.text((x+24, y+20), 'SMART FEATURES THAT SUPPORT THE WORK', font=font(27, True), fill=NAVY)
tech = [
    ('FUZZY FILE-NAME MATCHING', 'Reads flexible file-name patterns to suggest document type and teaching load.'),
    ('SMART AUTO-FILL', 'Suggests the matching load and an available term/week; users verify before archiving.'),
    ('K-MEANS GROUPING', 'Groups school or teacher upload patterns to help focus follow-up.'),
    ('COMPLIANCE ANALYTICS', 'Turns submissions into school and district summaries, trends, and action lists.'),
    ('QR + SHA-256', 'Each archived file can show a QR verification link and a file fingerprint.'),
    ('GABAY AI ASSISTANT', 'Answers common system questions in English or Tagalog.'),
]
for i, (label, copy) in enumerate(tech):
    col, row = i % 2, i // 2
    tx, ty = x+20+col*460, y+68+row*185
    rounded((tx, ty, tx+440, ty+165), WHITE, 18, '#D9E2F2', 2)
    d.text((tx+14, ty+14), label, font=font(20, True), fill=BLUE if i not in (2, 4) else GREEN)
    paragraph(tx+14, ty+53, copy, 22, INK, 410, 5)

# Back cover: guide users from archived record to the right system action.
x, y = panel_bg(1, y0, WHITE)
y = title(x, y, 'Find and verify your records', 52)
y = paragraph(x, y+10, 'Archives keeps uploaded documents together by school, teacher, grade, subject, term, and week.', 31, MUTED, 930, 9)
y += 20
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOT  •  ARCHIVES BY PERIOD')
y += 65
crop_image(src['archives'], (x, y, x+950, y+445), crop=(52, 135, 1825, 805))
y += 465
for t in [
    'Use the folder trail and period filters to reach the right school, teacher, term, and week.',
    'Search filenames; check the review/compliance labels; open, download, or share a record using its actions.',
]:
    y = bullet(x, y, t, 27, max_width=900)
    y += 8
y += 5
rounded((x, y, x+465, y+300), '#EFF8F4', 24, '#CDE9DA', 2)
d.text((x+22, y+20), 'WEEKLY COMPLIANCE', font=font(27, True), fill=GREEN)
paragraph(x+22, y+68, 'DLL/DLP follow the Open calendar period and its deadline. Compliance tracks missing, on-time, late, and reviewed work.', 25, INK, 420, 7)
rounded((x+485, y, x+950, y+300), '#FFF8EC', 24, '#F3DFBC', 2)
d.text((x+507, y+20), 'ADMINISTRATIVE FILES', font=font(27, True), fill=GOLD)
paragraph(x+507, y+68, 'ISP/ISR stay in Archives for review and remarks. They are not assigned a calendar week or included in weekly DLL/DLP compliance.', 25, INK, 420, 7)
y += 320
rounded((x, y, x+950, y+385), '#F2F5FB', 24, '#D9E2F2', 2)
d.text((x+22, y+20), 'READ THE ARCHIVE LABELS', font=font(27, True), fill=NAVY)
legend = [
    ('FOR CHECKING', 'Awaiting reviewer action', GOLD),
    ('CHECKED', 'Review has been completed', GREEN),
    ('COMPLIANT', 'On-time weekly DLL/DLP', GREEN),
    ('SUPPLEMENTARY', 'Additional file; review only', BLUE),
]
for i, (label, meaning, color) in enumerate(legend):
    col, row = i % 2, i // 2
    lx, ly = x+24+col*455, y+82+row*132
    rounded((lx, ly, lx+420, ly+105), WHITE, 16, '#D9E2F2', 2)
    d.text((lx+14, ly+12), label, font=font(22, True), fill=color)
    paragraph(lx+14, ly+48, meaning, 23, INK, 390, 5)
y += 405
rounded((x, y, x+950, y+450), '#F2F5FB', 24, '#D9E2F2', 2)
screenshot_tag(x+18, y+16, 'GABAY  •  CEDIMS ASSISTANT', width=470)
contain_image(src['chatbot'], (x+18, y+82, x+300, y+420), background='#F2F5FB', radius=14)
paragraph(x+330, y+90, 'Need help? Ask Gabay about uploads, deadlines, compliance, Archives, remarks, or Daily Lesson Plans—in English or Tagalog.', 27, INK, 580, 9)
rounded((x+330, y+290, x+900, y+365), NAVY, 16)
d.text((x+350, y+312), 'cedimscalapan.com  •  Sign in with your account', font=font(22, True), fill=WHITE)
y += 470
rounded((x, y, x+950, y+300), '#EFF8F4', 24, '#CDE9DA', 2)
d.text((x+22, y+18), 'VERIFY AN ARCHIVED DOCUMENT', font=font(26, True), fill=GREEN)
crop_image(src['upload_result'], (x+20, y+62, x+220, y+272), crop=(185, 500, 340, 655), radius=15)
paragraph(x+245, y+72, 'Scan the document QR code to open its verification details. Compare the SHA-256 fingerprint to confirm the archived file has not changed.', 25, INK, 675, 8)

# Front cover.
x, y = panel_bg(2, y0, '#F3F6FC')
crest = Image.open(ROOT / 'static' / 'deped-calapan-east-district.jpg').convert('RGB')
crest.thumbnail((140, 140), Image.Resampling.LANCZOS)
im.paste(crest, (x+6, y+8))
d.text((x+170, y+33), 'CALAPAN EAST DISTRICT', font=font(25, True), fill=MUTED)
y += 190
d.text((x, y), 'SMART-E', font=font(96, True), fill=NAVY)
d.text((x, y+106), 'VISION', font=font(98, True), fill=GOLD)
y += 240
y = paragraph(x, y, 'CALAPAN EAST DISTRICT INSTRUCTIONAL MONITORING SYSTEM', 37, INK, 930, 12, True)
y += 20
y = paragraph(x, y, 'Smarter instructional monitoring. Clearer support for every school.', 34, MUTED, 900, 12)
school_art = Image.open(ROOT / 'static' / 'deped-calapan-east-district.jpg').convert('RGB')
school_art.thumbnail((930, 590), Image.Resampling.LANCZOS)
im.paste(school_art, (x, y+24))
y += 640
rounded((x, y, x+950, y+300), NAVY, 32)
d.text((x+40, y+42), 'ONE SYSTEM. FIVE ROLE SCOPES.', font=font(34, True), fill=WHITE)
paragraph(x+40, y+104, 'Upload • Review • Monitor • Preserve', 31, '#E6ECFF', 860, 8)
paragraph(x, y+335, 'CEDIMS is the system’s deployment name.', 28, MUTED, 930, 8)
rounded((x, y+390, x+950, y+900), WHITE, 28, '#D9E2F2', 2)
d.text((x+28, y+412), 'BUILT FOR CLEARER FOLLOW-THROUGH', font=font(29, True), fill=NAVY)
cover_benefits = [
    ('LESS GUESSWORK', 'Filename-assisted detection helps prefill upload details for user confirmation.'),
    ('TRACEABLE RECORDS', 'Archive receipts include QR verification and a SHA-256 file fingerprint.'),
    ('SHARED VISIBILITY', 'School and district views turn submissions into practical follow-up.'),
]
for i, (label, copy) in enumerate(cover_benefits):
    bx = x+22+i*307
    rounded((bx, y+470, bx+292, y+855), '#F3F6FC', 18, '#D9E2F2', 2)
    d.text((bx+14, y+490), label, font=font(21, True), fill=BLUE if i != 1 else GREEN)
    paragraph(bx+14, y+535, copy, 23, INK, 260, 7)

# INSIDE: teacher, school review roles, district supervisor/admin.
section_label(SIDE_H, 'INSIDE PANELS  |  Role-by-role features and how they work')
y0 = SIDE_H + 90

# Teacher and Master Teacher upload panel.
x, y = panel_bg(0, y0, WHITE)
y = title(x, y, 'TEACHER & MASTER TEACHER', 47)
y = paragraph(x, y+8, 'Manage teaching loads, submit required work, and confirm what is still outstanding.', 30, MUTED, 920, 8)
y += 18
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOTS  •  LOADS + SUBMISSION TRACKER')
y += 65
contain_image(src['teaching_load'], (x, y, x+450, y+280))
contain_image(src['submission_tracker'], (x+480, y, x+960, y+280))
d.text((x+10, y+286), 'Add a grade/subject teaching load', font=font(24, True), fill=MUTED)
d.text((x+490, y+286), 'Check expected, submitted, and missing items', font=font(24, True), fill=MUTED)
y += 330
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOT  •  UPLOAD DETAILS REVIEW')
y += 65
contain_image(src['upload_review'], (x, y, x+960, y+470), background='#F4F6FB')
y += 490
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOT  •  UPLOAD RESULT')
y += 65
contain_image(src['upload_result'], (x, y, x+360, y+470))
paragraph(x+390, y+26, 'Before submitting, verify the suggested teaching load, document type, term, and week. The success receipt preserves the archive details and provides its QR verification and SHA-256 fingerprint.', 28, INK, 545, 9)
y += 495
rounded((x, y, x+960, y+220), '#EFF8F4', 24, '#CDE9DA', 2)
d.text((x+25, y+20), 'UPLOAD RULE', font=font(28, True), fill=GREEN)
paragraph(x+25, y+68, 'Only Open calendar periods are available for new weekly DLL/DLP uploads. ISP/ISR are administrative archive documents.', 27, INK, 900, 7)

# Master Teacher + School Head panel.
x, y = panel_bg(1, y0, PALE)
y = title(x, y, 'MASTER TEACHER & SCHOOL HEAD', 46)
rounded((x, y+12, x+460, y+78), '#FFF2DC', 18)
d.text((x+19, y+27), 'MASTER TEACHER', font=font(27, True), fill='#A95B00')
rounded((x+480, y+12, x+960, y+78), '#E8EEFF', 18)
d.text((x+500, y+27), 'SCHOOL HEAD', font=font(27, True), fill=NAVY)
y += 115
y = paragraph(x, y, 'Review submissions and monitor compliance within your school’s assigned scope.', 30, MUTED, 930, 8)
y += 20
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOT  •  REVIEW TRACKER')
y += 70
crop_image(src['review_tracker'], (x, y, x+960, y+400), crop=(0, 0, 1770, 420))
y += 425
for t in [
    'Open For Checking and filter by date, teacher, grade level, or subject.',
    'Open a submission, review the file, and save clear remarks for the teacher.',
    'Use the school Compliance tab to see missing, late, on-time, and checked totals.',
]:
    y = bullet(x, y, t, 29, max_width=900)
    y += 12
screenshot_tag(x, y+4, 'REAL SYSTEM SCREENSHOT  •  CREATE REMARK')
y += 70
contain_image(src['remark'], (x, y, x+450, y+280))
paragraph(x+475, y+25, 'Use the remark form to record review feedback on the selected submission. Saved remarks complete its review state.', 27, INK, 470, 8)
y += 305
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOT  •  SCHOOL HEAD COMPLIANCE')
y += 65
crop_image(src['school_compliance'], (x, y, x+460, y+300), crop=(0, 0, 1500, 815))
crop_image(src['teacher_compliance'], (x+480, y, x+960, y+300), crop=(0, 70, 1832, 745))
d.text((x+12, y+307), 'School compliance summary', font=font(23, True), fill=MUTED)
d.text((x+492, y+307), 'Teacher follow-up list', font=font(23, True), fill=MUTED)
y += 350
paragraph(x, y, 'School Heads use the school summary and teacher action list to prioritize missing work, check review status, and export reports.', 26, MUTED, 920, 7)
y += 110
rounded((x, y, x+960, y+255), WHITE, 22, '#D9E2F2', 2)
d.text((x+20, y+16), 'A CLEAR REVIEW IN THREE STEPS', font=font(25, True), fill=NAVY)
review_steps = [
    ('1', 'Open the correct file'),
    ('2', 'Check its period and teaching load'),
    ('3', 'Leave a specific, helpful remark'),
]
for i, (number, copy) in enumerate(review_steps):
    ry = y+60+i*58
    rounded((x+22, ry, x+62, ry+40), '#E8EEFF', 12)
    d.text((x+35, ry+7), number, font=font(21, True), fill=BLUE)
    d.text((x+78, ry+8), copy, font=font(23, True), fill=INK)

# District Supervisor + Admin panel.
x, y = panel_bg(2, y0, WHITE)
y = title(x, y, 'DISTRICT SUPERVISOR & ADMIN', 48)
rounded((x, y+12, x+450, y+78), '#E8EEFF', 18)
d.text((x+18, y+27), 'DISTRICT SUPERVISOR', font=font(24, True), fill=NAVY)
rounded((x+470, y+12, x+960, y+78), '#FFF2DC', 18)
d.text((x+490, y+27), 'ADMIN', font=font(27, True), fill='#A95B00')
y += 115
screenshot_tag(x, y, 'REAL SYSTEM SCREENSHOT  •  DISTRICT COMPLIANCE')
y += 65
crop_image(src['district_compliance'], (x, y, x+460, y+320), crop=(0, 0, 1450, 690))
crop_image(src['district_analytics'], (x+480, y, x+960, y+320), crop=(60, 70, 1810, 650))
d.text((x+12, y+327), 'District compliance totals', font=font(22, True), fill=MUTED)
d.text((x+492, y+327), 'K-means groups + trend analytics', font=font(22, True), fill=MUTED)
y += 365
for t in [
    'District Supervisor: compare district schools, inspect K-means patterns and missing-work trends, and export reports.',
    'Admin: use the same Compliance tabs, and manage users and the academic calendar.',
]:
    y = bullet(x, y, t, 27, max_width=900)
    y += 12
screenshot_tag(x, y+4, 'REAL SYSTEM SCREENSHOT  •  ADMIN ACADEMIC CALENDAR')
y += 70
crop_image(src['calendar'], (x, y, x+960, y+420), crop=(0, 0, 1650, 820))
y += 440
screenshot_tag(x, y+4, 'REAL SYSTEM SCREENSHOT  •  CREATE USER')
y += 70
contain_image(src['user_creation'], (x, y, x+410, y+520))
paragraph(x+435, y+22, 'Admin creates authorized accounts and assigns their role, district, and school. Open/Closed calendar entries control which weekly periods can receive uploads.', 27, INK, 510, 8)
y += 540
paragraph(x, y, 'Admin-only controls are restricted by account role; monitoring totals are shared with the District Supervisor.', 25, MUTED, 900, 7)

# Fold guides and fine print labels.
for y in (90, SIDE_H+90):
    for x in (PANEL_W, 2*PANEL_W):
        d.line((x, y+20, x, y+SIDE_H-20), fill='#B9C6DA', width=3)
        for yy in range(y+26, y+SIDE_H-20, 32):
            d.line((x, yy, x, min(yy+13, y+SIDE_H-20)), fill='#E9EEF7', width=4)

# Small footer, confidentiality reminder, and print directions.
for y in (SIDE_H-68, H-68):
    d.text((54, y), 'SMART-E VISION  |  Calapan East District Instructional Monitoring System', font=font(22, True), fill='#66758C')
    d.text((W-650, y), 'TRI-FOLD • PRINT BOTH SIDES', font=font(22, True), fill='#66758C')

im.save(OUT, 'PNG', dpi=(300, 300), optimize=True)
print(OUT)
