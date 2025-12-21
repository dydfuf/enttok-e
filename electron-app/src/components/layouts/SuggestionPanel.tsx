export default function SuggestionPanel() {
  return (
    <aside className="w-72 h-full bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Suggestions
        </h2>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          Connect GitHub to get activity-based suggestions
        </div>
      </div>
    </aside>
  );
}
