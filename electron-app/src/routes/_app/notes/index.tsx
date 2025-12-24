import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FolderOpen, RefreshCw } from "lucide-react";
import { useNotes } from "@/hooks/useNotes";
import { useVault } from "@/contexts/VaultContext";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/notes/")({
  component: NotesIndexPage,
});

function NotesIndexPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");

  const { selectVault } = useVault();
  const { vaultPath, notes, isLoading, error, loadNotes, createNote } =
    useNotes();

  const handleSelectVault = async () => {
    const success = await selectVault();
    if (success) {
      toast.success("Vault selected successfully");
    }
  };

  const handleCreateNote = async () => {
    if (!noteTitle.trim()) {
      toast.error("Please enter a note title");
      return;
    }

    const note = await createNote(noteTitle.trim());
    if (note) {
      toast.success(`Note "${noteTitle}" created!`);
      setNoteTitle("");
      setOpen(false);
      // Navigate to the new note
      navigate({ to: "/notes/$noteId", params: { noteId: note.id } });
    } else {
      toast.error("Failed to create note");
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  // No vault selected
  if (!vaultPath) {
    return (
      <div className="min-h-full p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center py-12">
            <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Vault Selected</h2>
            <p className="text-muted-foreground mb-6">
              Select a folder to store your notes
            </p>
            <Button onClick={handleSelectVault} size="lg">
              <FolderOpen className="w-4 h-4 mr-2" />
              Select Vault Folder
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Notes</h1>
            <p className="text-sm text-muted-foreground truncate max-w-md">
              {vaultPath}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={loadNotes}
              disabled={isLoading}
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button variant="outline" onClick={handleSelectVault}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Change Vault
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Note</DialogTitle>
                  <DialogDescription>
                    Enter a title for your new note. You can add content after
                    creating it.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="title" className="mb-2">
                    Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="My new note..."
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateNote();
                      }
                    }}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateNote} disabled={isLoading}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-md mb-4">
            {error}
          </div>
        )}

        {isLoading && notes.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
            <p className="text-muted-foreground mt-2">Loading notes...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No notes yet. Create your first note.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <Link
                key={note.id}
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                className="block p-4 bg-card border border-border rounded-lg hover:border-primary transition-colors"
              >
                <h3 className="font-medium">{note.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDate(note.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
