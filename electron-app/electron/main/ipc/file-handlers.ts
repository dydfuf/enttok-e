import { ipcMain, shell } from "electron";
import {
  readFile,
  writeFile,
  writeBinaryFile,
  showOpenDialog,
  showSaveDialog,
} from "../../file-handlers.js";

export function registerFileHandlers() {
  ipcMain.handle("file:read", (_, filePath: string) => readFile(filePath));
  ipcMain.handle("file:write", (_, filePath: string, content: string) =>
    writeFile(filePath, content)
  );
  ipcMain.handle("file:write-binary", (_, filePath: string, base64: string) =>
    writeBinaryFile(filePath, base64)
  );
  ipcMain.handle("file:open-dialog", () => showOpenDialog());
  ipcMain.handle("file:save-dialog", (_, defaultPath?: string) =>
    showSaveDialog(defaultPath)
  );
  ipcMain.handle("system:open-external", async (_event, url: string) => {
    if (!url) {
      return { success: false, error: "Missing URL" };
    }
    try {
      const parsed = new URL(url);
      const allowedProtocols = new Set(["http:", "https:", "mailto:"]);
      if (!allowedProtocols.has(parsed.protocol)) {
        return { success: false, error: "Unsupported URL protocol" };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open link",
      };
    }
  });
}
