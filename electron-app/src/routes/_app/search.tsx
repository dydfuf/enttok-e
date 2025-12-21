import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/search")({
  component: SearchPage,
});

function SearchPage() {
  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search notes..."
            className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            Enter a search term to find notes
          </p>
        </div>
      </div>
    </div>
  );
}
