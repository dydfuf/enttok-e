import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { useNotes } from "@/hooks/useNotes";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = Route.useParams();
  const navigate = useNavigate();
  const { vaultPath, getNotePath } = useNotes();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadNotePath() {
      if (!vaultPath) {
        navigate({ to: "/notes" });
        return;
      }

      setIsLoading(true);
      setError(null);

      const path = await getNotePath(noteId);
      if (path) {
        setFilePath(path);
      } else {
        setError("Note not found");
      }
      setIsLoading(false);
    }

    loadNotePath();
  }, [noteId, vaultPath, getNotePath, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !filePath) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">{error || "Note not found"}</p>
          <button
            onClick={() => navigate({ to: "/notes" })}
            className="text-primary underline"
          >
            Back to Notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <EditorLayout
      initialFilePath={filePath}
      className="h-full"
      vaultPath={vaultPath}
    />
  );
}
