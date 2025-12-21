import { dialog, BrowserWindow } from "electron";
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  readdir,
  stat,
  mkdir,
} from "fs/promises";
import path from "path";

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
