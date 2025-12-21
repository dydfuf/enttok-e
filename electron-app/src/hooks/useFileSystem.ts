import { useState, useCallback, useEffect } from "react";

interface FileResult {
  success: boolean;
  data?: string;
  error?: string;
}

interface OpenDialogResult {
  filePath: string;
  content: string;
}

interface SaveDialogResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

interface ElectronAPI {
  send: (channel: string, data: unknown) => void;
  receive: (channel: string, func: (...args: unknown[]) => void) => void;
  readFile: (filePath: string) => Promise<FileResult>;
  writeFile: (filePath: string, content: string) => Promise<FileResult>;
  openFileDialog: () => Promise<OpenDialogResult | null>;
  saveFileDialog: (defaultPath?: string) => Promise<SaveDialogResult>;
}

// Type assertion helper for Electron API
const electronAPI = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;

export interface UseFileSystemReturn {
  filePath: string | null;
  content: string;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  openFile: () => Promise<void>;
  saveFile: () => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
  setContent: (content: string) => void;
  createNewFile: () => void;
  loadFile: (path: string) => Promise<void>;
}

export function useFileSystem(initialContent = ""): UseFileSystemReturn {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContentState] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = content !== savedContent;

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setError(null);
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result: FileResult = await electronAPI.readFile(path);
      if (result.success && result.data !== undefined) {
        setFilePath(path);
        setContentState(result.data);
        setSavedContent(result.data);
      } else {
        setError(result.error || "Failed to read file");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openFile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await electronAPI.openFileDialog();
      if (result) {
        setFilePath(result.filePath);
        setContentState(result.content);
        setSavedContent(result.content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open file");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveFile = useCallback(async (): Promise<boolean> => {
    if (!filePath) {
      return saveFileAs();
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await electronAPI.writeFile(filePath, content);
      if (result.success) {
        setSavedContent(content);
        return true;
      }
      setError(result.error || "Failed to save file");
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [filePath, content]);

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await electronAPI.saveFileDialog(
        filePath || undefined
      );
      if (result.canceled) {
        return false;
      }
      if (result.success && result.filePath) {
        const writeResult = await electronAPI.writeFile(
          result.filePath,
          content
        );
        if (writeResult.success) {
          setFilePath(result.filePath);
          setSavedContent(content);
          return true;
        }
        setError(writeResult.error || "Failed to save file");
        return false;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [filePath, content]);

  const createNewFile = useCallback(() => {
    setFilePath(null);
    setContentState("");
    setSavedContent("");
    setError(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          saveFileAs();
        } else {
          saveFile();
        }
      }

      if (isMod && e.key === "o") {
        e.preventDefault();
        openFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile, saveFileAs, openFile]);

  return {
    filePath,
    content,
    isDirty,
    isLoading,
    error,
    openFile,
    saveFile,
    saveFileAs,
    setContent,
    createNewFile,
    loadFile,
  };
}
