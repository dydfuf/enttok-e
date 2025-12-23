import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import {
  readFile,
  writeFile,
  showOpenDialog,
  showSaveDialog,
  showSelectFolderDialog,
  listMarkdownFiles,
  createNote,
  getNotePath,
  getDailyNotePath,
  createDailyNote,
  listDailyNoteDates,
} from "./file-handlers.js";
import {
  getCurrentVaultPath,
  setCurrentVaultPath,
  clearCurrentVaultPath,
  getRecentVaults,
  removeFromRecentVaults,
} from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

function createWindow() {
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    titleBarOverlay: isMac
      ? {
          color: "#00000000",
          symbolColor: "#ffffff",
          height: 32,
        }
      : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    // 개발 모드: Vite 개발 서버 로드
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션: 빌드된 파일 로드
    mainWindow.loadFile(path.join(__dirname, "../../dist-react/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handlers for file operations
ipcMain.handle("file:read", (_, filePath: string) => readFile(filePath));
ipcMain.handle("file:write", (_, filePath: string, content: string) =>
  writeFile(filePath, content)
);
ipcMain.handle("file:open-dialog", () => showOpenDialog());
ipcMain.handle("file:save-dialog", (_, defaultPath?: string) =>
  showSaveDialog(defaultPath)
);

// IPC Handlers for vault/notes operations
ipcMain.handle("vault:select-folder", () => showSelectFolderDialog());
ipcMain.handle("vault:list-notes", (_, folderPath: string) =>
  listMarkdownFiles(folderPath)
);
ipcMain.handle("vault:create-note", (_, folderPath: string, title: string) =>
  createNote(folderPath, title)
);
ipcMain.handle("vault:get-note-path", (_, folderPath: string, noteId: string) =>
  getNotePath(folderPath, noteId)
);

// IPC Handlers for daily notes
ipcMain.handle("daily:get-path", (_, vaultPath: string, date: string) =>
  getDailyNotePath(vaultPath, date)
);
ipcMain.handle("daily:create", (_, vaultPath: string, date: string) =>
  createDailyNote(vaultPath, date)
);
ipcMain.handle("daily:list-dates", (_, vaultPath: string) =>
  listDailyNoteDates(vaultPath)
);

// IPC Handlers for vault store
ipcMain.handle("store:get-current-vault", () => getCurrentVaultPath());
ipcMain.handle("store:set-current-vault", (_, vaultPath: string) => {
  setCurrentVaultPath(vaultPath);
  return { success: true };
});
ipcMain.handle("store:clear-current-vault", () => {
  clearCurrentVaultPath();
  return { success: true };
});
ipcMain.handle("store:get-recent-vaults", () => getRecentVaults());
ipcMain.handle("store:remove-recent-vault", (_, vaultPath: string) => {
  removeFromRecentVaults(vaultPath);
  return { success: true };
});
