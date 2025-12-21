import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/notes/")({
  component: NotesIndexPage,
});

function NotesIndexPage() {
  const [open, setOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");

  // TODO: Load notes from vault
  const notes: { id: string; title: string; updatedAt: string }[] = [];

  const handleCreateNote = () => {
    if (!noteTitle.trim()) {
      toast.error("Please enter a note title");
      return;
    }
    // TODO: Actually create the note
    toast.success(`Note "${noteTitle}" created!`);
    setNoteTitle("");
    setOpen(false);
  };

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Notes
          </h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4" />
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
                <Button onClick={handleCreateNote}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {notes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
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
                className="block p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-500 transition-colors"
              >
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  {note.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {note.updatedAt}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
