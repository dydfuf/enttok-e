import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorLayout } from "@/components/editor/EditorLayout";

type DailyNotePageProps = {
  date: Date;
  vaultPath: string | null;
  createOrGetDailyNote: (date: Date) => Promise<{ filePath: string } | null>;
  onErrorAction: () => void;
  errorActionLabel: string;
};

export function DailyNotePage({
  date,
  vaultPath,
  createOrGetDailyNote,
  onErrorAction,
  errorActionLabel,
}: DailyNotePageProps) {
  const navigate = useNavigate();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadOrCreateNote() {
      if (!vaultPath) {
        if (isMounted) {
          setFilePath(null);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      setFilePath(null);

      const result = await createOrGetDailyNote(date);
      if (!isMounted) {
        return;
      }
      if (result) {
        setFilePath(result.filePath);
      } else {
        setError("Failed to load daily note");
      }
      setIsLoading(false);
    }

    loadOrCreateNote();
    return () => {
      isMounted = false;
    };
  }, [vaultPath, date, createOrGetDailyNote]);

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
          <Button onClick={onErrorAction}>{errorActionLabel}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <EditorLayout
          initialFilePath={filePath}
          className="h-full"
          hideToolbar
          vaultPath={vaultPath}
        />
      </div>
    </div>
  );
}
