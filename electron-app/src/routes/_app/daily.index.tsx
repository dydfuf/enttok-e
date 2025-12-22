import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isToday } from "date-fns";
import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { DailyHeader } from "@/components/daily/DailyHeader";
import { useDailyNotes } from "@/hooks/useDailyNotes";

export const Route = createFileRoute("/_app/daily/")({
  component: DailyIndexPage,
});

function DailyIndexPage() {
  const navigate = useNavigate();
  const today = new Date();

  const {
    vaultPath,
    datesWithNotes,
    createOrGetDailyNote,
    formatDateForStorage,
    loadDatesWithNotes,
  } = useDailyNotes();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrCreateNote() {
      if (!vaultPath) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const result = await createOrGetDailyNote(today);
      if (result) {
        setFilePath(result.filePath);
      } else {
        setError("Failed to load daily note");
      }
      setIsLoading(false);
    }

    loadOrCreateNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath]);

  const handleNavigate = (date: Date) => {
    const dateStr = formatDateForStorage(date);
    if (isToday(date)) {
      loadDatesWithNotes();
    } else {
      navigate({ to: "/daily/$date", params: { date: dateStr } });
    }
  };

  // No vault selected
  if (!vaultPath) {
    return (
      <div className="h-full p-6">
        <div className="max-w-3xl mx-auto text-center py-12">
          <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Vault Selected</h2>
          <p className="text-muted-foreground mb-6">
            Please select a vault folder in the Notes section first.
          </p>
          <Button onClick={() => navigate({ to: "/notes" })} size="lg">
            Go to Notes
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !filePath) {
    return (
      <div className="h-full p-6">
        <div className="max-w-3xl mx-auto text-center py-12">
          <p className="text-destructive mb-4">{error || "Failed to load note"}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6">
        <DailyHeader
          date={today}
          datesWithNotes={datesWithNotes}
          onNavigate={handleNavigate}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorLayout initialFilePath={filePath} className="h-full" />
      </div>
    </div>
  );
}
