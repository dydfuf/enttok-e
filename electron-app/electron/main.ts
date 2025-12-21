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
} from "./file-handlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
