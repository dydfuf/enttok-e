import { dialog, BrowserWindow } from "electron";
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  readdir,
  stat,
  mkdir,
} from "fs/promises";
import path from "path";
import { getDailyNotesFolder, getDailyNoteTemplate } from "./store.js";

export interface FileResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface OpenDialogResult {
  filePath: string;
  content: string;
}

export interface SaveDialogResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export async function readFile(filePath: string): Promise<FileResult> {
  try {
    const data = await fsReadFile(filePath, "utf-8");
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read file",
    };
  }
}

export async function writeFile(
  filePath: string,
  content: string
): Promise<FileResult> {
  try {
    await fsWriteFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
    };
  }
}

export async function writeBinaryFile(
  filePath: string,
  base64Data: string
): Promise<FileResult> {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const buffer = Buffer.from(base64Data, "base64");
    await fsWriteFile(filePath, buffer);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
    };
  }
}

export async function showOpenDialog(): Promise<OpenDialogResult | null> {
  const window = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(window!, {
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileResult = await readFile(filePath);

  if (!fileResult.success) {
    return null;
  }

  return {
    filePath,
    content: fileResult.data!,
  };
}

export async function showSaveDialog(
  defaultPath?: string
): Promise<SaveDialogResult> {
  const window = BrowserWindow.getFocusedWindow();
  const result = await dialog.showSaveDialog(window!, {
    defaultPath,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  return {
    success: true,
    filePath: result.filePath,
  };
}

export interface SelectFolderResult {
  success: boolean;
  folderPath?: string;
  canceled?: boolean;
}

export async function showSelectFolderDialog(): Promise<SelectFolderResult> {
  const window = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(window!, {
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  return {
    success: true,
    folderPath: result.filePaths[0],
  };
}

export interface NoteInfo {
  id: string;
  title: string;
  filePath: string;
  updatedAt: string;
}

export interface ListNotesResult {
  success: boolean;
  notes?: NoteInfo[];
  error?: string;
}

export async function listMarkdownFiles(
  folderPath: string
): Promise<ListNotesResult> {
  try {
    const files = await readdir(folderPath);
    const notes: NoteInfo[] = [];

    for (const file of files) {
      if (file.endsWith(".md")) {
        const filePath = path.join(folderPath, file);
        const fileStat = await stat(filePath);
        const title = file.replace(/\.md$/, "");

        notes.push({
          id: encodeURIComponent(title),
          title,
          filePath,
          updatedAt: fileStat.mtime.toISOString(),
        });
      }
    }

    // Sort by updated time, newest first
    notes.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return { success: true, notes };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to list files",
    };
  }
}

export interface CreateNoteResult {
  success: boolean;
  note?: NoteInfo;
  error?: string;
}

export async function createNote(
  folderPath: string,
  title: string
): Promise<CreateNoteResult> {
  try {
    // Ensure folder exists
    await mkdir(folderPath, { recursive: true });

    const fileName = `${title}.md`;
    const filePath = path.join(folderPath, fileName);

    // Create empty file with title as heading
    const content = `# ${title}\n\n`;
    await fsWriteFile(filePath, content, "utf-8");

    const fileStat = await stat(filePath);

    return {
      success: true,
      note: {
        id: encodeURIComponent(title),
        title,
        filePath,
        updatedAt: fileStat.mtime.toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create note",
    };
  }
}

export async function getNotePath(
  folderPath: string,
  noteId: string
): Promise<string | null> {
  try {
    const title = decodeURIComponent(noteId);
    const filePath = path.join(folderPath, `${title}.md`);
    await stat(filePath); // Check if exists
    return filePath;
  } catch {
    return null;
  }
}

// ========== Daily Notes Functions ==========

const DEFAULT_DAILY_FOLDER = "daily";
const DATE_PLACEHOLDER = /\{\{\s*date\s*\}\}/g;

function resolveDailyFolderSegments(): string[] {
  const stored = getDailyNotesFolder();
  if (!stored) {
    return [DEFAULT_DAILY_FOLDER];
  }

  const normalized = stored.trim().replace(/\\/g, "/");
  if (!normalized) {
    return [DEFAULT_DAILY_FOLDER];
  }

  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return [DEFAULT_DAILY_FOLDER];
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [DEFAULT_DAILY_FOLDER];
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return [DEFAULT_DAILY_FOLDER];
  }

  return segments;
}

function getDailyFolderPath(vaultPath: string): string {
  return path.join(vaultPath, ...resolveDailyFolderSegments());
}

function applyDailyTemplate(template: string, date: string): string {
  if (!template) {
    return "";
  }
  return template.replace(DATE_PLACEHOLDER, date);
}

export function getDailyNotePath(vaultPath: string, date: string): string {
  return path.join(getDailyFolderPath(vaultPath), `${date}.md`);
}

export interface DailyNoteResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function createDailyNote(
  vaultPath: string,
  date: string
): Promise<DailyNoteResult> {
  try {
    const dailyDir = getDailyFolderPath(vaultPath);
    await mkdir(dailyDir, { recursive: true });

    const filePath = getDailyNotePath(vaultPath, date);

    // Check if file already exists
    try {
      await stat(filePath);
      // File exists, return it
      return { success: true, filePath };
    } catch {
      // File doesn't exist, create it
    }

    // Create with template
    const template = getDailyNoteTemplate();
    const content = applyDailyTemplate(template, date);
    await fsWriteFile(filePath, content, "utf-8");

    return { success: true, filePath };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create daily note",
    };
  }
}

export interface DailyNoteDatesResult {
  success: boolean;
  dates?: string[];
  error?: string;
}

export async function listDailyNoteDates(
  vaultPath: string
): Promise<DailyNoteDatesResult> {
  try {
    const dailyDir = getDailyFolderPath(vaultPath);

    try {
      await stat(dailyDir);
    } catch {
      // Directory doesn't exist yet
      return { success: true, dates: [] };
    }

    const files = await readdir(dailyDir);
    const dates = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace(".md", ""));

    return { success: true, dates };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list daily note dates",
    };
  }
}
