import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceDir = "C:/Users/ASUS/OneDrive/Documents/ChatGPT/CDEDIMSCALAPAN";
const RUNTIME_NODE_MODULES = "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { FileBlob, PresentationFile } = await import(pathToFileURL(path.join(RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")).href);
const finalPath = path.join(workspaceDir, "output", "CEDIMS_System_Overview_Roles.pptx");
const outDir = path.join(workspaceDir, ".codex-build", "cedims-system-ppt", "slides");
await fs.mkdir(outDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(finalPath));
for (let i = 0; i < 10; i++) {
  const slide = presentation.slides.getItem(i);
  const preview = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(outDir);
