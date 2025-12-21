import { useState, useCallback, useEffect } from "react";

interface NoteInfo {
  id: string;
  title: string;
  filePath: string;
  updatedAt: string;
}

interface SelectFolderResult {
  success: boolean;
  folderPath?: string;
  canceled?: boolean;
}

interface ListNotesResult {
  success: boolean;
  notes?: NoteInfo[];
  error?: string;
}

interface CreateNoteResult {
  success: boolean;
  note?: NoteInfo;
  error?: string;
}

interface VaultAPI {
  selectVaultFolder: () => Promise<SelectFolderResult>;
  listNotes: (folderPath: string) => Promise<ListNotesResult>;
  createNote: (folderPath: string, title: string) => Promise<CreateNoteResult>;
  getNotePath: (folderPath: string, noteId: string) => Promise<string | null>;
}

const vaultAPI = (
  window as unknown as { electronAPI: VaultAPI }
).electronAPI;

const VAULT_PATH_KEY = "vault-path";

export interface UseNotesReturn {
  vaultPath: string | null;
  notes: NoteInfo[];
  isLoading: boolean;
  error: string | null;
  selectVault: () => Promise<boolean>;
  loadNotes: () => Promise<void>;
  createNote: (title: string) => Promise<NoteInfo | null>;
  getNotePath: (noteId: string) => Promise<string | null>;
}

export function useNotes(): UseNotesReturn {
  const [vaultPath, setVaultPath] = useState<string | null>(() => {
    return localStorage.getItem(VAULT_PATH_KEY);
  });
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectVault = useCallback(async (): Promise<boolean> => {
    try {
      const result = await vaultAPI.selectVaultFolder();
      if (result.success && result.folderPath) {
        setVaultPath(result.folderPath);
        localStorage.setItem(VAULT_PATH_KEY, result.folderPath);
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select vault");
      return false;
    }
  }, []);

  const loadNotes = useCallback(async () => {
    if (!vaultPath) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await vaultAPI.listNotes(vaultPath);
      if (result.success && result.notes) {
        setNotes(result.notes);
      } else {
        setError(result.error || "Failed to load notes");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  }, [vaultPath]);

  const createNote = useCallback(
    async (title: string): Promise<NoteInfo | null> => {
      if (!vaultPath) {
        setError("No vault selected");
        return null;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await vaultAPI.createNote(vaultPath, title);
        if (result.success && result.note) {
          setNotes((prev) => [result.note!, ...prev]);
          return result.note;
        }
        setError(result.error || "Failed to create note");
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create note");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [vaultPath]
  );

  const getNotePath = useCallback(
    async (noteId: string): Promise<string | null> => {
      if (!vaultPath) return null;
      return vaultAPI.getNotePath(vaultPath, noteId);
    },
    [vaultPath]
  );

  // Load notes when vault path changes
  useEffect(() => {
    if (vaultPath) {
      loadNotes();
    }
  }, [vaultPath, loadNotes]);

  return {
    vaultPath,
    notes,
    isLoading,
    error,
    selectVault,
    loadNotes,
    createNote,
    getNotePath,
  };
}
