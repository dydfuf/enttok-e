import { useState, useCallback, useEffect } from "react";
import { useVault } from "@/contexts/VaultContext";

interface NoteInfo {
  id: string;
  title: string;
  filePath: string;
  updatedAt: string;
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
  listNotes: (folderPath: string) => Promise<ListNotesResult>;
  createNote: (folderPath: string, title: string) => Promise<CreateNoteResult>;
  getNotePath: (folderPath: string, noteId: string) => Promise<string | null>;
}

const vaultAPI = (window as unknown as { electronAPI: VaultAPI }).electronAPI;

export interface UseNotesReturn {
  vaultPath: string | null;
  notes: NoteInfo[];
  isLoading: boolean;
  error: string | null;
  loadNotes: () => Promise<void>;
  createNote: (title: string) => Promise<NoteInfo | null>;
  getNotePath: (noteId: string) => Promise<string | null>;
}

export function useNotes(): UseNotesReturn {
  const { vaultPath } = useVault();
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    loadNotes,
    createNote,
    getNotePath,
  };
}
