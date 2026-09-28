import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceDir = "C:/Users/ASUS/OneDrive/Documents/ChatGPT/CDEDIMSCALAPAN";
const SKILL_DIR = "C:/Users/ASUS/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const RUNTIME_NODE_MODULES = "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const RUNTIME_PYTHON = "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const TMP_DIR = path.join(workspaceDir, ".codex-build", "cedims-system-ppt");
const FINAL_PPTX = path.join(workspaceDir, "output", "CEDIMS_System_Overview_Roles_v2.pptx");
process.env.RUNTIME_NODE_MODULES = RUNTIME_NODE_MODULES;

const artifactModule = await import(pathToFileURL(path.join(RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")).href);
const { Presentation, PresentationFile } = artifactModule;
const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools", "artifact_tool_utils.mjs")).href,
);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const W = 1280;
const H = 720;
const BLUE = "#1E40AF";
const DEEP = "#0F172A";
const MUTED = "#53657D";
const PALE = "#EEF4FF";
const LINE = "#D7E0EF";
const GOLD = "#F2B705";
const GREEN = "#148A4F";
const RED = "#DC2626";
const WHITE = "#FFFFFF";
const font = resolvePresentationFont({ fontFamily: "Aptos" });
const presentation = Presentation.create({ slideSize: { width: W, height: H } });

async function bytes(rel) {
  return new Uint8Array(await fs.readFile(path.join(workspaceDir, rel)));
}

const appIcon = await bytes("static/app_icon.png");
const depedLogo = await bytes("static/deped-official.png");
const chatbot = await bytes("static/chatbot.png");
const schoolImage = await bytes("static/deped-calapan-east-district.jpg");

function addText(slide, text, x, y, w, h, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: font,
    fontSize: style.size ?? 24,
    bold: style.bold ?? false,
    color: style.color ?? DEEP,
    alignment: style.align ?? "left",
    verticalAlignment: style.valign ?? "top",
    autoFit: "shrinkText",
    wrap: true,
  };
  return shape;
}

function addBox(slide, x, y, w, h, fill = WHITE, line = LINE, radius = 12) {
  const shape = slide.shapes.add({
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: 1 },
  });
  shape.borderRadius = radius;
  return shape;
}

function addHeader(slide, title, kicker = "CEDIMS system overview") {
  slide.background.fill = "#F8FAFC";
  addText(slide, kicker.toUpperCase(), 64, 34, 600, 28, { size: 13, bold: true, color: BLUE });
  addText(slide, title, 64, 62, 900, 54, { size: 34, bold: true, color: DEEP });
  slide.images.add({ blob: appIcon, contentType: "image/png", position: { left: 1138, top: 34, width: 60, height: 60 }, fit: "contain", alt: "CEDIMS app icon" });
}

function addFooter(slide, n) {
  addText(slide, "Calapan East District Instructional Monitoring System", 64, 672, 620, 24, { size: 12, color: MUTED });
  addText(slide, String(n).padStart(2, "0"), 1170, 672, 46, 24, { size: 12, bold: true, color: MUTED, align: "right" });
}

function addBullets(slide, items, x, y, w, gap = 54) {
  items.forEach((item, i) => {
    const top = y + i * gap;
    const dot = slide.shapes.add({ geometry: "ellipse", position: { left: x, top: top + 8, width: 10, height: 10 }, fill: item.color ?? BLUE, line: { fill: "none", width: 0 } });
    addText(slide, item.text, x + 26, top, w - 26, 42, { size: item.size ?? 20, color: item.muted ? MUTED : DEEP, bold: item.bold ?? false });
  });
}

function addRoleColumn(slide, x, title, subtitle, items, color) {
  addText(slide, title, x, 166, 320, 34, { size: 24, bold: true, color });
  addText(slide, subtitle, x, 202, 320, 46, { size: 15, color: MUTED });
  addBullets(slide, items.map(text => ({ text, color })), x, 270, 340, 64);
}

function notes(slide, text) {
  slide.speakerNotes.textFrame.setText(`${text}\n\nSources: docs/UserManual_Concise.md; src/lib/config/navigation.ts; src/lib/config/walkthroughSteps.ts; static/manifest.json.`);
}

// 1
{
  const slide = presentation.slides.add();
  slide.background.fill = BLUE;
  slide.images.add({ blob: schoolImage, contentType: "image/jpeg", position: { left: 672, top: 0, width: 608, height: 720 }, fit: "cover", alt: "Calapan East District school image" });
  slide.shapes.add({ geometry: "rect", position: { left: 610, top: 0, width: 670, height: 720 }, fill: "#0F172A99", line: { fill: "none", width: 0 } });
  slide.images.add({ blob: depedLogo, contentType: "image/png", position: { left: 72, top: 64, width: 90, height: 90 }, fit: "contain", alt: "DepEd logo" });
  slide.images.add({ blob: appIcon, contentType: "image/png", position: { left: 176, top: 72, width: 72, height: 72 }, fit: "contain", alt: "CEDIMS icon" });
  addText(slide, "CEDIMS", 72, 210, 520, 70, { size: 58, bold: true, color: WHITE });
  addText(slide, "Calapan East District\nInstructional Monitoring System", 76, 292, 500, 86, { size: 25, color: "#EAF1FF" });
  addText(slide, "System overview and role guide", 76, 414, 540, 44, { size: 24, bold: true, color: GOLD });
  addText(slide, "For Teachers, Master Teachers, and School Heads", 76, 470, 560, 34, { size: 18, color: "#DCE8FF" });
  notes(slide, "Introduce CEDIMS as the school and district system for submitting, checking, archiving, and monitoring instructional documents.");
}

// 2
{
  const slide = presentation.slides.add();
  addHeader(slide, "What the system does");
  addText(slide, "CEDIMS keeps instructional document work in one place: upload, verify, review, archive, and monitor compliance by school year, term, and week.", 76, 150, 1040, 72, { size: 25, color: DEEP });
  const items = [
    ["Teachers submit DLLs and track their own weekly requirements", BLUE],
    ["Master Teachers help review files and support teacher compliance", GREEN],
    ["School Heads monitor the whole school and follow up missing work", GOLD],
    ["Archives preserve every submitted file with search, remarks, and QR verification", RED],
  ];
  items.forEach(([text, color], i) => {
    const y = 280 + i * 78;
    addBox(slide, 96, y, 1040, 52, WHITE, LINE, 10);
    slide.shapes.add({ geometry: "rect", position: { left: 96, top: y, width: 10, height: 52 }, fill: color, line: { fill: "none", width: 0 } });
    addText(slide, text, 126, y + 12, 960, 26, { size: 21, bold: true, color: DEEP });
  });
  addFooter(slide, 2);
  notes(slide, "Explain the system in one plain sentence first, then connect each role to the part they use most.");
}

// 3
{
  const slide = presentation.slides.add();
  addHeader(slide, "Main workflow");
  const steps = [
    ["1", "Prepare", "Teacher prepares the required DLL or supervisory document"],
    ["2", "Upload", "CEDIMS reads the file, detects details, and confirms the period"],
    ["3", "Archive", "The submitted PDF receives a QR stamp and stays searchable"],
    ["4", "Review", "Authorized reviewers add remarks and mark checking status"],
    ["5", "Monitor", "Compliance shows overdue files and items for checking"],
  ];
  steps.forEach(([num, title, body], i) => {
    const x = 70 + i * 238;
    addBox(slide, x, 210, 198, 210, WHITE, LINE, 12);
    slide.shapes.add({ geometry: "ellipse", position: { left: x + 20, top: 232, width: 44, height: 44 }, fill: BLUE, line: { fill: "none", width: 0 } });
    addText(slide, num, x + 20, 238, 44, 26, { size: 18, bold: true, color: WHITE, align: "center" });
    addText(slide, title, x + 20, 298, 158, 32, { size: 23, bold: true, color: DEEP });
    addText(slide, body, x + 20, 342, 158, 64, { size: 16, color: MUTED });
  });
  addText(slide, "Checking stays in Archive. Compliance helps leaders decide who needs follow-up.", 108, 505, 990, 42, { size: 23, bold: true, color: BLUE, align: "center" });
  addFooter(slide, 3);
  notes(slide, "Use this slide to explain the system flow from document preparation to compliance follow-up.");
}

// 4
{
  const slide = presentation.slides.add();
  addHeader(slide, "Tools shared across roles");
  const shared = [
    ["Tracker", "Shows submitted, missing, late, and review items"],
    ["Calendar", "Displays school year, terms, weeks, and deadlines"],
    ["Archive", "Stores documents with search, filters, remarks, and download"],
    ["QR verification", "Confirms authenticity of stamped PDF files"],
    ["Notifications", "Alerts users about deadlines, remarks, and tasks"],
    ["Gabay chatbot", "Answers questions using the user role and available data"],
  ];
  shared.forEach(([title, body], i) => {
    const x = 80 + (i % 2) * 560;
    const y = 150 + Math.floor(i / 2) * 132;
    addBox(slide, x, y, 500, 94, WHITE, LINE, 12);
    addText(slide, title, x + 24, y + 18, 220, 26, { size: 23, bold: true, color: BLUE });
    addText(slide, body, x + 24, y + 50, 440, 30, { size: 16, color: MUTED });
  });
  slide.images.add({ blob: chatbot, contentType: "image/png", position: { left: 1096, top: 568, width: 76, height: 76 }, fit: "contain", alt: "Gabay chatbot mascot" });
  addFooter(slide, 4);
  notes(slide, "These features appear across roles, although each role sees different data based on permissions.");
}

// 5
{
  const slide = presentation.slides.add();
  addHeader(slide, "Teacher role");
  addText(slide, "Main purpose: submit the correct document for each teaching load, term, and week.", 76, 134, 990, 42, { size: 23, bold: true, color: DEEP });
  addRoleColumn(slide, 90, "Daily use", "What teachers check first", [
    "Open Tracker for missing or upcoming DLLs",
    "Use Teaching Load for assigned subjects and grades",
    "Check Archive for past submissions and feedback",
  ], BLUE);
  addRoleColumn(slide, 500, "Upload support", "What the system helps detect", [
    "Reads PDF, DOC, or DOCX files",
    "Suggests subject, grade, term, week, and document type",
    "Flags possible duplicate or mismatched files",
  ], GREEN);
  addRoleColumn(slide, 910, "After upload", "What teachers can prove", [
    "PDF receives a QR verification stamp",
    "Submission status shows on time, late, or missing",
    "Review comments stay connected to the archived file",
  ], GOLD);
  addFooter(slide, 5);
  notes(slide, "Explain that the teacher workflow focuses on accurate submission and personal tracking.");
}

// 6
{
  const slide = presentation.slides.add();
  addHeader(slide, "Teacher upload flow");
  const rows = [
    ["Choose file", "Select PDF, DOC, DOCX, JPG, or PNG"],
    ["Confirm details", "Review detected load, term, week, subject, and grade"],
    ["Submit", "CEDIMS converts, stamps, stores, and records status"],
    ["Check Archive", "Teacher can verify the final file and view remarks"],
  ];
  rows.forEach(([title, body], i) => {
    const y = 160 + i * 102;
    addBox(slide, 126, y, 920, 72, WHITE, LINE, 10);
    addText(slide, String(i + 1), 154, y + 18, 44, 32, { size: 24, bold: true, color: BLUE, align: "center" });
    addText(slide, title, 230, y + 14, 260, 28, { size: 23, bold: true, color: DEEP });
    addText(slide, body, 504, y + 17, 500, 30, { size: 18, color: MUTED });
  });
  addText(slide, "Best explanation: the teacher still confirms the result before archiving.", 150, 594, 880, 30, { size: 20, bold: true, color: BLUE, align: "center" });
  addFooter(slide, 6);
  notes(slide, "Use this slide to walk a teacher through the upload screen in order.");
}

// 7
{
  const slide = presentation.slides.add();
  addHeader(slide, "Master Teacher role");
  addText(slide, "Main purpose: submit required documents and help the school review and improve DLL compliance.", 76, 134, 1050, 42, { size: 23, bold: true, color: DEEP });
  const boxes = [
    ["Own submissions", "Can upload Daily Lesson Plans with teaching load, plus ISP or ISR when required.", BLUE],
    ["Compliance support", "Uses Compliance to see missing, late, or unchecked DLLs in one focused list.", GREEN],
    ["Archive review", "Filters documents, opens files, adds remarks, and tracks checking status.", GOLD],
    ["Teacher patterns", "Uses K-means groups to identify teachers who need routine support first.", RED],
  ];
  boxes.forEach(([title, body, color], i) => {
    const x = 92 + (i % 2) * 540;
    const y = 190 + Math.floor(i / 2) * 170;
    addBox(slide, x, y, 480, 120, WHITE, LINE, 12);
    slide.shapes.add({ geometry: "rect", position: { left: x, top: y, width: 12, height: 120 }, fill: color, line: { fill: "none", width: 0 } });
    addText(slide, title, x + 34, y + 20, 390, 30, { size: 24, bold: true, color });
    addText(slide, body, x + 34, y + 58, 400, 42, { size: 17, color: MUTED });
  });
  addFooter(slide, 7);
  notes(slide, "Explain that Master Teachers have both personal upload responsibilities and school support responsibilities.");
}

// 8
{
  const slide = presentation.slides.add();
  addHeader(slide, "School Head role");
  addText(slide, "Main purpose: monitor school compliance, check files, and guide teachers with clear follow-up.", 76, 134, 1050, 42, { size: 23, bold: true, color: DEEP });
  addBullets(slide, [
    { text: "Compliance shows overdue DLLs, files for checking, and submitted of expected", color: RED, bold: true },
    { text: "K-means grouping separates one-week misses from repeated submission patterns", color: BLUE, bold: true },
    { text: "Archive keeps checking work: remarks, approval status, document search, and exports", color: GREEN, bold: true },
    { text: "Reports support meetings, coaching, and submission follow-up by term and week", color: GOLD, bold: true },
  ], 116, 230, 1030, 78);
  addBox(slide, 160, 575, 860, 50, PALE, "#C8D7F6", 10);
  addText(slide, "Easy explanation: School Heads use Compliance to decide who to follow up, then use Archive to check the actual file.", 186, 588, 810, 24, { size: 18, bold: true, color: BLUE, align: "center" });
  addFooter(slide, 8);
  notes(slide, "Stress the difference between Compliance and Archive. Compliance is for follow-up decisions. Archive is for document checking.");
}

// 9
{
  const slide = presentation.slides.add();
  addHeader(slide, "Role access at a glance");
  const cols = ["Feature", "Teacher", "Master Teacher", "School Head"];
  const rows = [
    ["Tracker", "Own status", "Own plus review items", "School review status"],
    ["Upload", "DLL", "DLL, ISP, ISR", "ISP, ISR"],
    ["Loads", "Own teaching load", "Own teaching load", "View through monitoring"],
    ["Compliance", "Personal tracker", "Teacher follow-up", "School follow-up"],
    ["Archive", "Own files", "School files for review", "School files and remarks"],
  ];
  const x = 70, y = 150, cw = [260, 270, 310, 310], rh = 62;
  cols.forEach((c, i) => {
    const left = x + cw.slice(0, i).reduce((a, b) => a + b, 0);
    addBox(slide, left, y, cw[i], rh, i === 0 ? BLUE : "#DBEAFE", i === 0 ? BLUE : LINE, 0);
    addText(slide, c, left + 16, y + 18, cw[i] - 32, 22, { size: 18, bold: true, color: i === 0 ? WHITE : DEEP, align: "center" });
  });
  rows.forEach((row, r) => {
    row.forEach((cell, i) => {
      const left = x + cw.slice(0, i).reduce((a, b) => a + b, 0);
      const top = y + rh + r * rh;
      addBox(slide, left, top, cw[i], rh, r % 2 ? "#F8FAFC" : WHITE, LINE, 0);
      addText(slide, cell, left + 14, top + 15, cw[i] - 28, 28, { size: i === 0 ? 17 : 15, bold: i === 0, color: i === 0 ? DEEP : MUTED, align: i === 0 ? "left" : "center" });
    });
  });
  addFooter(slide, 9);
  notes(slide, "This table summarizes the practical difference between the three requested roles.");
}

// 10
{
  const slide = presentation.slides.add();
  slide.background.fill = "#F8FAFC";
  slide.images.add({ blob: appIcon, contentType: "image/png", position: { left: 80, top: 70, width: 88, height: 88 }, fit: "contain", alt: "CEDIMS app icon" });
  addText(slide, "How to explain CEDIMS in one minute", 80, 188, 760, 52, { size: 40, bold: true, color: DEEP });
  addText(slide, "Teachers submit and track. Master Teachers review and support. School Heads monitor and follow up. The Archive keeps the evidence, and Compliance tells leaders where attention is needed.", 84, 274, 1000, 100, { size: 25, color: MUTED });
  addBox(slide, 84, 430, 990, 82, BLUE, BLUE, 12);
  addText(slide, "The goal is simple: fewer missing DLLs, faster checking, and clearer documentation for every school week.", 118, 450, 920, 38, { size: 25, bold: true, color: WHITE, align: "center" });
  addText(slide, "Suggested next demo: open Upload, show one archived file, then open Compliance for follow-up decisions.", 88, 592, 1020, 34, { size: 18, color: MUTED, align: "center" });
  addFooter(slide, 10);
  notes(slide, "Use this as the closing script. It connects each role to a clear action and closes with the purpose of the system.");
}

const expectedSlideSizeEmu = "12192000,6858000";
const fontPolicy = { basis: "design", families: [font] };
const requirements = {
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
};

const stagingDir = path.join(workspaceDir, ".codex-finalizer");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "cedims-system-candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", expectedSlideSizeEmu,
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  requiredNativeTableOwnerSlides: [],
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "CEDIMS_System_Overview_Roles_v2.validation.json"),
});

for (let i = 0; i < presentation.slides.length; i++) {
  const slide = presentation.slides.get(i);
  const preview = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const montage = await presentation.export({ format: "webp", montage: true, scale: 0.6 });
await fs.writeFile(path.join(TMP_DIR, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));

console.log(FINAL_PPTX);
