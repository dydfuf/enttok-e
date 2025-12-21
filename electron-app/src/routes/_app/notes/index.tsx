import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/notes/")({
  component: NotesIndexPage,
});

function NotesIndexPage() {
  // TODO: Load notes from vault
  const notes: { id: string; title: string; updatedAt: string }[] = [];

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Notes
          </h1>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            New Note
          </button>
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
