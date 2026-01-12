import { useState, useCallback, useEffect } from "react";
import type { FileResult } from "@/shared/electron-api";
import { requireElectronAPI } from "@/lib/electron";

export interface UseFileSystemReturn {
  filePath: string | null;
  content: string;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  openFile: () => Promise<void>;
  saveFile: () => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
  setContent: (content: string) => void;
  createNewFile: () => void;
  loadFile: (path: string) => Promise<void>;
}

export function useFileSystem(initialContent = ""): UseFileSystemReturn {
  const electronAPI = requireElectronAPI();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContentState] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  }, [electronAPI]);

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setIsSaving(true);
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
      setIsSaving(false);
    }
  }, [electronAPI, filePath, content]);

  const saveFile = useCallback(async (): Promise<boolean> => {
    if (!filePath) {
      return saveFileAs();
    }

    setIsLoading(true);
    setIsSaving(true);
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
      setIsSaving(false);
    }
  }, [electronAPI, filePath, content, saveFileAs]);

  const createNewFile = useCallback(() => {
    setFilePath(null);
    setContentState("");
    setSavedContent("");
    setError(null);
  }, [electronAPI]);

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
    isSaving,
    error,
    openFile,
    saveFile,
    saveFileAs,
    setContent,
    createNewFile,
    loadFile,
  };
}
