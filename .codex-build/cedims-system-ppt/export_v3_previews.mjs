import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceDir = "C:/Users/ASUS/OneDrive/Documents/ChatGPT/CDEDIMSCALAPAN";
const runtimeNodeModules = "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const sourcePath = path.join(workspaceDir, "output", "CEDIMS_System_Overview_Roles_v3.pptx");
const outDir = path.join(workspaceDir, ".codex-build", "cedims-system-ppt-v3", "slides");
process.env.RUNTIME_NODE_MODULES = runtimeNodeModules;

const { FileBlob, PresentationFile } = await import(
  pathToFileURL(path.join(runtimeNodeModules, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")).href
);

await fs.mkdir(outDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
for (let i = 0; i < presentation.slides.length; i++) {
  const slide = presentation.slides.get(i);
  const preview = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

console.log(outDir);
