import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/tags/")({
  component: TagsIndexPage,
});

function TagsIndexPage() {
  // TODO: Load tags from vault
  const tags: { name: string; count: number }[] = [];

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Tags
          </h1>
        </div>

        {tags.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No tags yet. Add #tags to your notes.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link key={tag.name} to="/tags/$tag" params={{ tag: tag.name }}>
                <Badge variant="secondary" className="text-sm py-1.5 px-3">
                  #{tag.name}
                  <span className="ml-1 opacity-60">({tag.count})</span>
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
