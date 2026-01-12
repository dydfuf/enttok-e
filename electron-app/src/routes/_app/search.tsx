import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNoteSearch } from "@/hooks/useNoteSearch";
import type { NoteSearchResult } from "@/shared/electron-api";

type SearchParams = {
  q?: string;
};

const RESULT_LIMIT = 200;

function buildTokens(query: string): string[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(text: string, tokens: string[]) {
  if (tokens.length === 0) {
    return text;
  }
  const tokenSet = new Set(tokens);
  const pattern = tokens.map(escapeRegExp).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, index) => {
    const isMatch = tokenSet.has(part.toLowerCase());
    if (!isMatch) {
      return part;
    }
    return (
      <mark
        key={`${part}-${index}`}
        className="rounded-sm bg-primary/20 px-0.5"
      >
        {part}
      </mark>
    );
  });
}

function formatUpdatedAt(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export const Route = createFileRoute("/_app/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const tokens = useMemo(() => buildTokens(query), [query]);
  const { results, isLoading, error, hasQuery } = useNoteSearch(query, {
    limit: RESULT_LIMIT,
    debounceMs: 200,
  });

  useEffect(() => {
    setQuery(q ?? "");
  }, [q]);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setQuery(value);
      navigate({
        to: "/search",
        search: { q: value.trim() ? value : undefined },
        replace: true,
      });
    },
    [navigate]
  );

  const renderResult = useCallback(
    (result: NoteSearchResult) => (
      <Link
        key={result.id}
        to="/notes/$noteId"
        params={{ noteId: result.id }}
        className="block p-4 bg-card border border-border rounded-lg hover:border-primary transition-colors"
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-medium">
            {renderHighlightedText(result.title, tokens)}
          </h3>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatUpdatedAt(result.updatedAt)}
          </span>
        </div>
        {result.relativePath && (
          <p className="text-xs text-muted-foreground mt-1">
            {result.relativePath}
          </p>
        )}
        {result.snippet && (
          <p className="text-sm text-muted-foreground mt-2">
            {renderHighlightedText(result.snippet, tokens)}
          </p>
        )}
      </Link>
    ),
    [tokens]
  );

  return (
    <div className="min-h-full p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Input
            type="text"
            placeholder="Search notes..."
            className="h-12 text-base"
            value={query}
            onChange={handleQueryChange}
          />
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-md">
            {error}
          </div>
        )}

        {!hasQuery ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Enter a search term to find notes
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching notes...
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No results found for "{query}"
            </p>
          </div>
        ) : (
          <div className="space-y-3">{results.map(renderResult)}</div>
        )}
      </div>
    </div>
  );
}
