import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { useVault } from "@/contexts/VaultContext";

interface DailyNoteResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

interface DailyNoteDatesResult {
  success: boolean;
  dates?: string[];
  error?: string;
}

interface DailyNoteAPI {
  getDailyNotePath: (vaultPath: string, date: string) => Promise<string>;
  createDailyNote: (vaultPath: string, date: string) => Promise<DailyNoteResult>;
  listDailyNoteDates: (vaultPath: string) => Promise<DailyNoteDatesResult>;
}

const dailyAPI = (window as unknown as { electronAPI: DailyNoteAPI })
  .electronAPI;

export interface UseDailyNotesReturn {
  vaultPath: string | null;
  datesWithNotes: Set<string>;
  isLoadingDates: boolean;
  loadDatesWithNotes: () => Promise<void>;
  getDailyNotePath: (date: Date) => Promise<string>;
  createOrGetDailyNote: (date: Date) => Promise<{ filePath: string } | null>;
  formatDateForStorage: (date: Date) => string;
}

export function useDailyNotes(): UseDailyNotesReturn {
  const { vaultPath } = useVault();
  const [datesWithNotes, setDatesWithNotes] = useState<Set<string>>(new Set());
  const [isLoadingDates, setIsLoadingDates] = useState(false);

  const formatDateForStorage = useCallback((date: Date): string => {
    return format(date, "yyyy-MM-dd");
  }, []);

  const loadDatesWithNotes = useCallback(async () => {
    if (!vaultPath) return;

    setIsLoadingDates(true);
    try {
      const result = await dailyAPI.listDailyNoteDates(vaultPath);
      if (result.success && result.dates) {
        setDatesWithNotes(new Set(result.dates));
      }
    } finally {
      setIsLoadingDates(false);
    }
  }, [vaultPath]);

  const getDailyNotePath = useCallback(
    async (date: Date): Promise<string> => {
      if (!vaultPath) throw new Error("No vault selected");
      const dateStr = formatDateForStorage(date);
      return dailyAPI.getDailyNotePath(vaultPath, dateStr);
    },
    [vaultPath, formatDateForStorage]
  );

  const createOrGetDailyNote = useCallback(
    async (date: Date): Promise<{ filePath: string } | null> => {
      if (!vaultPath) return null;

      const dateStr = formatDateForStorage(date);
      const result = await dailyAPI.createDailyNote(vaultPath, dateStr);

      if (result.success && result.filePath) {
        // Update the dates cache
        setDatesWithNotes((prev) => new Set([...prev, dateStr]));
        return { filePath: result.filePath };
      }

      return null;
    },
    [vaultPath, formatDateForStorage]
  );

  // Load dates on mount
  useEffect(() => {
    loadDatesWithNotes();
  }, [loadDatesWithNotes]);

  return {
    vaultPath,
    datesWithNotes,
    isLoadingDates,
    loadDatesWithNotes,
    getDailyNotePath,
    createOrGetDailyNote,
    formatDateForStorage,
  };
}
