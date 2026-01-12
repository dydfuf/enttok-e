import { ipcMain } from "electron";
import {
  showSelectFolderDialog,
  listMarkdownFiles,
  createNote,
  getNotePath,
  getDailyNotePath,
  createDailyNote,
  listDailyNoteDates,
} from "../../file-handlers.js";

export function registerVaultHandlers() {
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
}
