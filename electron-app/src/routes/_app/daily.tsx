import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/daily")({
  component: DailyPage,
});

function DailyPage() {
  const today = new Date().toISOString().split("T")[0];
  const navigate = useNavigate();

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {today}
          </h1>
          <button
            onClick={() => navigate({ to: "/daily/$date", params: { date: today } })}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            View in calendar
          </button>
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Today's Tasks
            </h2>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 min-h-[200px]">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Start writing your daily note...
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Tomorrow's Plan
            </h2>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 min-h-[100px]">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Plan for tomorrow...
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Notes
            </h2>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 min-h-[100px]">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Additional notes...
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
