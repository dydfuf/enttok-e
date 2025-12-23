import { app } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getPreloadPath() {
  return path.join(__dirname, "preload.js");
}

export function getRendererIndexPath() {
  return path.join(__dirname, "../../dist-react/index.html");
}

export function getBackendBaseDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend");
  }
  const repoRoot = path.resolve(__dirname, "../../..");
  const repoBackend = path.join(repoRoot, "backend");
  if (fs.existsSync(repoBackend)) {
    return repoBackend;
  }
  return path.resolve(app.getAppPath(), "..", "backend");
}

export function getBackendPythonPath(baseDir: string) {
  if (process.platform === "win32") {
    return path.join(baseDir, ".venv", "Scripts", "python.exe");
  }
  return path.join(baseDir, ".venv", "bin", "python");
}
