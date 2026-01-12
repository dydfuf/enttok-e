import { useEffect, useMemo, useState } from "react";
import type {
  NoteSearchResult,
  SearchNotesResult,
} from "@/shared/electron-api";
import { useVault } from "@/contexts/VaultContext";
import { requireElectronAPI } from "@/lib/electron";

export interface UseNoteSearchOptions {
  limit?: number;
  debounceMs?: number;
  rootPath?: string | null;
}

export interface UseNoteSearchReturn {
  results: NoteSearchResult[];
  isLoading: boolean;
  error: string | null;
  hasQuery: boolean;
}

export function useNoteSearch(
  query: string,
  options: UseNoteSearchOptions = {}
): UseNoteSearchReturn {
  const { vaultPath } = useVault();
  const api = useMemo(() => requireElectronAPI(), []);
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const debounceMs = options.debounceMs ?? 200;
  const limit = options.limit;
  const searchRoot =
    options.rootPath !== undefined ? options.rootPath : vaultPath;

  useEffect(() => {
    if (!searchRoot || !trimmedQuery) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    const timer = setTimeout(() => {
      setIsLoading(true);
      setError(null);
      api
        .searchNotes({ vaultPath: searchRoot, query: trimmedQuery, limit })
        .then((result: SearchNotesResult) => {
          if (!isActive) return;
          if (result.success) {
            setResults(result.results ?? []);
          } else {
            setResults([]);
            setError(result.error || "Failed to search notes");
          }
        })
        .catch((err) => {
          if (!isActive) return;
          setResults([]);
          setError(
            err instanceof Error ? err.message : "Failed to search notes"
          );
        })
        .finally(() => {
          if (!isActive) return;
          setIsLoading(false);
        });
    }, debounceMs);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [api, debounceMs, limit, searchRoot, trimmedQuery]);

  return {
    results,
    isLoading,
    error,
    hasQuery: Boolean(trimmedQuery),
  };
}
