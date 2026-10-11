import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceDir = "C:/Users/ASUS/OneDrive/Documents/ChatGPT/CDEDIMSCALAPAN";
const SKILL_DIR = "C:/Users/ASUS/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const RUNTIME_NODE_MODULES = "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const RUNTIME_PYTHON = "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const TMP_DIR = path.join(workspaceDir, ".codex-build", "cedims-system-ppt-v3");
const FINAL_PPTX = path.join(workspaceDir, "output", "CEDIMS_System_Overview_Roles_v4.pptx");
process.env.RUNTIME_NODE_MODULES = RUNTIME_NODE_MODULES;

const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")).href);
const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools", "artifact_tool_utils.mjs")).href,
);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const W = 1280;
const H = 720;
const BLUE = "#1E40AF";
const NAVY = "#0F172A";
const TEXT = "#1F2937";
const MUTED = "#53657D";
const SOFT = "#F3F7FC";
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
const schoolImage = await bytes("static/deped-calapan-east-district.jpg");
const chatbot = await bytes("static/chatbot.png");

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
    fontSize: style.size ?? 26,
    bold: style.bold ?? false,
    color: style.color ?? TEXT,
    alignment: style.align ?? "left",
    verticalAlignment: style.valign ?? "top",
    autoFit: "shrinkText",
    wrap: true,
  };
  return shape;
}

function box(slide, x, y, w, h, fill = WHITE, line = LINE, radius = 8) {
  const shape = slide.shapes.add({
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: 1 },
  });
  shape.borderRadius = radius;
  return shape;
}

function header(slide, title, kicker = "CEDIMS system guide") {
  slide.background.fill = SOFT;
  addText(slide, kicker.toUpperCase(), 64, 34, 640, 26, { size: 15, bold: true, color: BLUE });
  addText(slide, title, 64, 68, 940, 60, { size: 40, bold: true, color: NAVY });
  slide.images.add({ blob: appIcon, contentType: "image/png", position: { left: 1140, top: 36, width: 58, height: 58 }, fit: "contain", alt: "CEDIMS app icon" });
}

function footer(slide, n) {
  addText(slide, "Calapan East District Instructional Monitoring System", 64, 676, 650, 24, { size: 13, color: MUTED });
  addText(slide, String(n).padStart(2, "0"), 1170, 676, 46, 24, { size: 13, bold: true, color: MUTED, align: "right" });
}

function notes(slide, text) {
  slide.speakerNotes.textFrame.setText(`${text}\n\nSources: docs/UserManual_Concise.md; src/lib/config/navigation.ts; src/lib/config/walkthroughSteps.ts; static/manifest.json.`);
}

function featurePlaceholder(slide, x, y, w, h, label) {
  box(slide, x, y, w, h, "#FFFFFF", "#93A8C8", 8);
  slide.shapes.add({ geometry: "rect", position: { left: x + 18, top: y + 18, width: w - 36, height: 48 }, fill: BLUE, line: { fill: "none", width: 0 } });
  addText(slide, label, x + 34, y + 30, w - 68, 24, { size: 19, bold: true, color: WHITE, align: "center" });
  slide.shapes.add({ geometry: "rect", position: { left: x + 18, top: y + 82, width: w - 36, height: h - 106 }, fill: "#EAF0F7", line: { fill: "#C8D3E4", width: 1 } });
  addText(slide, "ADD EXACT\nSYSTEM PICTURE", x + 42, y + h / 2 - 54, w - 84, 78, { size: 30, bold: true, color: BLUE, align: "center" });
}

function featureSlide(title, definition, uses, imageLabel, n, color = BLUE) {
  const slide = presentation.slides.add();
  header(slide, title, "Feature definition");
  box(slide, 70, 148, 570, 142, WHITE, LINE, 8);
  slide.shapes.add({ geometry: "rect", position: { left: 70, top: 148, width: 12, height: 142 }, fill: color, line: { fill: "none", width: 0 } });
  addText(slide, "Definition", 104, 170, 240, 28, { size: 22, bold: true, color });
  addText(slide, definition, 104, 208, 492, 58, { size: 28, bold: true, color: NAVY });
  addText(slide, "What to show in your picture", 76, 322, 520, 34, { size: 26, bold: true, color });
  uses.forEach((item, i) => {
    const y = 376 + i * 68;
    slide.shapes.add({ geometry: "ellipse", position: { left: 84, top: y + 8, width: 16, height: 16 }, fill: color, line: { fill: "none", width: 0 } });
    addText(slide, item, 118, y, 520, 42, { size: 25, color: TEXT });
  });
  featurePlaceholder(slide, 704, 150, 482, 440, imageLabel);
  footer(slide, n);
  notes(slide, `Define ${title} and leave the right side for the exact system screenshot.`);
}

// 1
{
  const slide = presentation.slides.add();
  slide.background.fill = BLUE;
  slide.images.add({ blob: schoolImage, contentType: "image/jpeg", position: { left: 690, top: 0, width: 590, height: 720 }, fit: "cover", alt: "Calapan East District image" });
  slide.shapes.add({ geometry: "rect", position: { left: 654, top: 0, width: 626, height: 720 }, fill: "#0F172AA8", line: { fill: "none", width: 0 } });
  slide.images.add({ blob: depedLogo, contentType: "image/png", position: { left: 82, top: 66, width: 92, height: 92 }, fit: "contain", alt: "DepEd logo" });
  slide.images.add({ blob: appIcon, contentType: "image/png", position: { left: 190, top: 74, width: 74, height: 74 }, fit: "contain", alt: "CEDIMS icon" });
  addText(slide, "CEDIMS", 82, 220, 520, 78, { size: 64, bold: true, color: WHITE });
  addText(slide, "System overview and role guide", 88, 328, 560, 46, { size: 31, bold: true, color: GOLD });
  addText(slide, "Teachers, Master Teachers, and School Heads", 88, 404, 560, 42, { size: 25, color: "#EAF1FF" });
  addText(slide, "Prepared for feature explanation and live demo screenshots", 88, 534, 540, 34, { size: 19, color: "#DCE8FF" });
  notes(slide, "Opening slide for the CEDIMS system presentation.");
}

// 2
{
  const slide = presentation.slides.add();
  header(slide, "What CEDIMS does");
  addText(slide, "CEDIMS manages instructional documents from upload to archive, review, and compliance follow-up.", 84, 152, 1050, 86, { size: 34, bold: true, color: NAVY });
  const items = [
    ["Upload", "Teachers submit files and confirm detected details", BLUE],
    ["Archive", "Approved files stay searchable with QR verification", GREEN],
    ["Review", "Master Teachers and School Heads add remarks", GOLD],
    ["Compliance", "Leaders see overdue and unchecked files first", RED],
  ];
  items.forEach(([title, body, color], i) => {
    const x = 82 + (i % 2) * 558;
    const y = 292 + Math.floor(i / 2) * 136;
    box(slide, x, y, 500, 102, WHITE, LINE, 8);
    slide.shapes.add({ geometry: "rect", position: { left: x, top: y, width: 12, height: 102 }, fill: color, line: { fill: "none", width: 0 } });
    addText(slide, title, x + 34, y + 18, 230, 30, { size: 28, bold: true, color });
    addText(slide, body, x + 34, y + 56, 420, 30, { size: 21, color: MUTED });
  });
  footer(slide, 2);
  notes(slide, "Simple definition of the system before explaining features and roles.");
}

// 3
{
  const slide = presentation.slides.add();
  header(slide, "Main workflow");
  const steps = [
    ["1", "Prepare", "Teacher prepares the file"],
    ["2", "Upload", "System detects details"],
    ["3", "Archive", "PDF is stored and verified"],
    ["4", "Review", "Reviewer adds remarks"],
    ["5", "Monitor", "Leaders follow up"],
  ];
  steps.forEach(([num, title, body], i) => {
    const x = 66 + i * 238;
    box(slide, x, 198, 202, 236, WHITE, LINE, 8);
    slide.shapes.add({ geometry: "ellipse", position: { left: x + 24, top: 224, width: 52, height: 52 }, fill: BLUE, line: { fill: "none", width: 0 } });
    addText(slide, num, x + 24, 232, 52, 30, { size: 23, bold: true, color: WHITE, align: "center" });
    addText(slide, title, x + 24, 308, 154, 32, { size: 27, bold: true, color: NAVY });
    addText(slide, body, x + 24, 354, 154, 54, { size: 20, color: MUTED });
  });
  box(slide, 126, 520, 1028, 70, BLUE, BLUE, 8);
  addText(slide, "Compliance tells who needs follow-up. Archive is where checking happens.", 158, 538, 960, 34, { size: 28, bold: true, color: WHITE, align: "center" });
  footer(slide, 3);
  notes(slide, "Use this as the quick walkthrough before opening screenshots.");
}

featureSlide("Tracker", "Shows each user what is submitted, missing, late, or still for checking.", ["Show status cards", "Show week or period filters", "Show teacher or school progress"], "Exact Tracker screenshot", 4, BLUE);
featureSlide("Upload", "Guides file submission and checks the detected subject, grade, term, week, and document type.", ["Show file selection", "Show detected details", "Show Confirm and Archive"], "Exact Upload screenshot", 5, GREEN);
featureSlide("Archive", "Stores submitted documents for search, viewing, remarks, downloads, and QR verification.", ["Show term and week folders", "Show document list", "Show remarks or status area"], "Exact Archive screenshot", 6, GOLD);
featureSlide("Compliance", "Shows overdue files and files for checking so leaders know who needs action first.", ["Show overdue count", "Show for checking count", "Show action list and K-means groups"], "Exact Compliance screenshot", 7, RED);
featureSlide("Loads", "Keeps teaching assignments connected to the correct grade, subject, term, and week.", ["Show teaching load list", "Show add or edit load", "Show role-based access"], "Exact Loads screenshot", 8, BLUE);

// 9
{
  const slide = presentation.slides.add();
  header(slide, "Teacher role");
  addText(slide, "Teacher focus: upload the right DLL and track personal weekly requirements.", 80, 150, 1050, 64, { size: 33, bold: true, color: NAVY });
  const items = ["Checks Tracker for missing or upcoming files", "Uses Upload to submit DLLs", "Confirms detected term, week, subject, and grade", "Views remarks and final PDFs in Archive"];
  items.forEach((item, i) => {
    const y = 272 + i * 70;
    slide.shapes.add({ geometry: "ellipse", position: { left: 88, top: y + 8, width: 16, height: 16 }, fill: BLUE, line: { fill: "none", width: 0 } });
    addText(slide, item, 122, y, 800, 38, { size: 26, color: TEXT });
  });
  featurePlaceholder(slide, 856, 278, 300, 250, "Teacher dashboard or upload screenshot");
  footer(slide, 9);
  notes(slide, "Teacher role explanation with a space for the exact teacher screen.");
}

// 10
{
  const slide = presentation.slides.add();
  header(slide, "Master Teacher role");
  addText(slide, "Master Teacher focus: submit required files and support checking for the school.", 80, 150, 1050, 64, { size: 33, bold: true, color: NAVY });
  const items = ["Uploads DLL, ISP, or ISR when assigned", "Uses Archive to review files and add remarks", "Uses Compliance to find missing or unchecked DLLs", "Uses pattern groups to identify teachers needing support"];
  items.forEach((item, i) => {
    const y = 272 + i * 70;
    slide.shapes.add({ geometry: "ellipse", position: { left: 88, top: y + 8, width: 16, height: 16 }, fill: GREEN, line: { fill: "none", width: 0 } });
    addText(slide, item, 122, y, 800, 38, { size: 26, color: TEXT });
  });
  featurePlaceholder(slide, 856, 278, 300, 250, "Master Teacher Archive or Compliance screenshot");
  footer(slide, 10);
  notes(slide, "Master Teacher role explanation with a screenshot placeholder.");
}

// 11
{
  const slide = presentation.slides.add();
  header(slide, "School Head role");
  addText(slide, "School Head focus: monitor the school, follow up overdue files, and confirm checking work.", 80, 150, 1050, 64, { size: 33, bold: true, color: NAVY });
  const items = ["Views school-level overdue and for checking counts", "Opens teacher or subject action lists", "Uses K-means groups to target support", "Exports period reports for meetings and monitoring"];
  items.forEach((item, i) => {
    const y = 272 + i * 70;
    slide.shapes.add({ geometry: "ellipse", position: { left: 88, top: y + 8, width: 16, height: 16 }, fill: RED, line: { fill: "none", width: 0 } });
    addText(slide, item, 122, y, 800, 38, { size: 26, color: TEXT });
  });
  featurePlaceholder(slide, 856, 278, 300, 250, "School Head Compliance screenshot");
  footer(slide, 11);
  notes(slide, "School Head role explanation with a screenshot placeholder.");
}

// 12
{
  const slide = presentation.slides.add();
  header(slide, "Role access at a glance");
  const cols = ["Feature", "Teacher", "Master Teacher", "School Head"];
  const rows = [
    ["Tracker", "Own status", "Own and review items", "School status"],
    ["Upload", "DLL", "DLL, ISP, ISR", "ISP, ISR"],
    ["Archive", "Own files", "School review files", "School files"],
    ["Compliance", "Personal view", "Teacher follow-up", "School follow-up"],
  ];
  const x = 74, y = 162, cw = [260, 278, 318, 318], rh = 78;
  cols.forEach((c, i) => {
    const left = x + cw.slice(0, i).reduce((a, b) => a + b, 0);
    box(slide, left, y, cw[i], rh, i === 0 ? BLUE : "#DBEAFE", i === 0 ? BLUE : LINE, 0);
    addText(slide, c, left + 14, y + 24, cw[i] - 28, 30, { size: 21, bold: true, color: i === 0 ? WHITE : NAVY, align: "center" });
  });
  rows.forEach((row, r) => {
    row.forEach((cell, i) => {
      const left = x + cw.slice(0, i).reduce((a, b) => a + b, 0);
      const top = y + rh + r * rh;
      box(slide, left, top, cw[i], rh, r % 2 ? "#F8FAFC" : WHITE, LINE, 0);
      addText(slide, cell, left + 16, top + 23, cw[i] - 32, 30, { size: i === 0 ? 22 : 20, bold: i === 0, color: i === 0 ? NAVY : MUTED, align: i === 0 ? "left" : "center" });
    });
  });
  footer(slide, 12);
  notes(slide, "Large role access table for easy viewing.");
}

// 13
{
  const slide = presentation.slides.add();
  header(slide, "Demo picture checklist");
  const list = [
    ["Tracker", "dashboard with status cards"],
    ["Upload", "detected load, term, week, and confirm button"],
    ["Archive", "term and week folders plus remarks"],
    ["Compliance", "overdue, for checking, K-means groups, and action list"],
    ["Loads", "teaching load assignment screen"],
  ];
  list.forEach(([feature, shot], i) => {
    const y = 150 + i * 88;
    box(slide, 82, y, 1030, 58, WHITE, LINE, 8);
    addText(slide, feature, 112, y + 14, 220, 28, { size: 24, bold: true, color: BLUE });
    addText(slide, shot, 352, y + 14, 720, 28, { size: 23, color: TEXT });
  });
  slide.images.add({ blob: chatbot, contentType: "image/png", position: { left: 1118, top: 550, width: 74, height: 74 }, fit: "contain", alt: "Gabay chatbot mascot" });
  footer(slide, 13);
  notes(slide, "Use this slide as the checklist for replacing placeholders with final screenshots.");
}

// 14
{
  const slide = presentation.slides.add();
  slide.background.fill = SOFT;
  slide.images.add({ blob: appIcon, contentType: "image/png", position: { left: 86, top: 82, width: 96, height: 96 }, fit: "contain", alt: "CEDIMS app icon" });
  addText(slide, "One-minute explanation", 86, 214, 880, 62, { size: 46, bold: true, color: NAVY });
  addText(slide, "Teachers submit and track. Master Teachers review and support. School Heads monitor and follow up. Archive keeps the evidence. Compliance shows where action is needed.", 90, 314, 1040, 112, { size: 31, color: MUTED });
  box(slide, 90, 500, 1010, 76, BLUE, BLUE, 8);
  addText(slide, "Goal: fewer missing DLLs, faster checking, and clearer weekly documentation.", 126, 520, 940, 34, { size: 29, bold: true, color: WHITE, align: "center" });
  footer(slide, 14);
  notes(slide, "Closing script for the presenter.");
}

const expectedSlideSizeEmu = "12192000,6858000";
const fontPolicy = { basis: "design", families: [font] };
const stagingDir = path.join(workspaceDir, ".codex-finalizer");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "cedims-system-candidate-v3.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

await finalizePresentation({
  explicitTotalSlideCount: 14,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", expectedSlideSizeEmu, "--validate-bullet-geometry", "--validate-heading-fit"],
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "CEDIMS_System_Overview_Roles_v4.validation.json"),
});

for (let i = 0; i < presentation.slides.length; i++) {
  const slide = presentation.slides.get(i);
  const preview = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const montage = await presentation.export({ format: "webp", montage: true, scale: 0.55 });
await fs.writeFile(path.join(TMP_DIR, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));

console.log(FINAL_PPTX);
