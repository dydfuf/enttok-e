import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/daily/$date")({
  component: DailyDatePage,
});

function DailyDatePage() {
  const { date } = Route.useParams();

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {date}
          </h1>
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Tasks
            </h2>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 min-h-[200px]">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No note for this date
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
