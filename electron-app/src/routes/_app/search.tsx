import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/search")({
  component: SearchPage,
});

function SearchPage() {
  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search notes..."
            className="h-12 text-base"
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
