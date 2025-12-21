import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = Route.useParams();

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Note: {noteId}
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 min-h-[400px]">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Editor will be here (Tiptap)
          </p>
        </div>
      </div>
    </div>
  );
}
