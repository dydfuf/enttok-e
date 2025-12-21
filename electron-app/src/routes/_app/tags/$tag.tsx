import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/tags/$tag")({
  component: TagDetailPage,
});

function TagDetailPage() {
  const { tag } = Route.useParams();

  // TODO: Load notes with this tag
  const notes: { id: string; title: string; updatedAt: string }[] = [];

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            to="/tags"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
          >
            &larr; Back to tags
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            #{tag}
          </h1>
        </div>

        {notes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No notes with this tag
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
