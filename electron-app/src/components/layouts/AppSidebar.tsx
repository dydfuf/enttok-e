import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarSearch, SidebarCalendar } from "@/components/sidebar";
import { useDailyNotes } from "@/hooks/useDailyNotes";
import { useNoteSearch } from "@/hooks/useNoteSearch";
import { getElectronAPI } from "@/lib/electron";
import { joinPath, validateDailyFolder } from "@/lib/vault-paths";
import type { NoteSearchResult } from "@/shared/electron-api";

export default function AppSidebar() {
  const location = useLocation();
  const [searchValue, setSearchValue] = useState("");
  const { datesWithNotes, vaultPath } = useDailyNotes();
  const isDailyRoute = location.pathname.startsWith("/daily");
  const electronAPI = useMemo(() => getElectronAPI(), []);
  const [dailyRootPath, setDailyRootPath] = useState<string | null>(null);

  const {
    results: dailyResults,
    isLoading: isDailySearching,
    error: dailySearchError,
  } = useNoteSearch(isDailyRoute ? searchValue : "", {
    rootPath: dailyRootPath,
    limit: 60,
    debounceMs: 200,
  });
  const hasDailyQuery = isDailyRoute && searchValue.trim().length > 0;
  const isDailySearchReady = Boolean(dailyRootPath);

  const dailySearchDates = useMemo(() => {
    if (!hasDailyQuery || !isDailySearchReady) {
      return null;
    }
    const matches = new Set<string>();
    for (const result of dailyResults) {
      const date = extractDailyDate(result);
      if (date) {
        matches.add(date);
      }
    }
    return matches;
  }, [dailyResults, hasDailyQuery, isDailySearchReady]);

  const calendarDates =
    isDailyRoute && hasDailyQuery && isDailySearchReady
      ? dailySearchDates ?? new Set()
      : datesWithNotes;

  const dailySearchItems = useMemo(() => {
    if (!hasDailyQuery || !isDailySearchReady) {
      return [];
    }
    const items: Array<{ date: string; snippet?: string }> = [];
    for (const result of dailyResults) {
      const date = extractDailyDate(result);
      if (!date) {
        continue;
      }
      items.push({ date, snippet: result.snippet });
    }
    return items.slice(0, 8);
  }, [dailyResults, hasDailyQuery, isDailySearchReady]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
    },
    []
  );

  useEffect(() => {
    if (isDailyRoute || !searchValue) {
      return;
    }
    setSearchValue("");
  }, [isDailyRoute, searchValue]);

  useEffect(() => {
    if (!vaultPath || !electronAPI) {
      setDailyRootPath(null);
      return;
    }
    let isMounted = true;
    electronAPI
      .getDailyNotesFolder()
      .then((folder) => {
        if (!isMounted) return;
        const validation = validateDailyFolder(folder);
        setDailyRootPath(joinPath(vaultPath, validation.normalized));
      })
      .catch(() => {
        if (!isMounted) return;
        const validation = validateDailyFolder(null);
        setDailyRootPath(joinPath(vaultPath, validation.normalized));
      });
    return () => {
      isMounted = false;
    };
  }, [electronAPI, vaultPath]);

  const searchPlaceholder = isDailyRoute
    ? "Search all daily notes..."
    : "Open Daily to search";

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar" className="border-r-0">
      <SidebarContent className="mt-4 gap-0 overflow-y-auto">
        {/* Search */}
        <div className="px-4 py-2">
          <SidebarSearch
            value={searchValue}
            onChange={handleSearchChange}
            placeholder={searchPlaceholder}
            disabled={!isDailyRoute}
          />
        </div>

        {/* Mini Calendar */}
        <div className="px-4 py-4">
          <SidebarCalendar datesWithNotes={calendarDates} />
        </div>

        {isDailyRoute && hasDailyQuery && (
          <>
            <div className="px-4">
              <Separator className="my-2" />
            </div>
            <div className="px-4 pb-3 space-y-2">
            {!isDailySearchReady && (
              <div className="text-xs text-muted-foreground">
                Preparing daily search...
              </div>
            )}
            {isDailySearchReady && dailySearchError && (
              <div className="text-xs text-destructive">{dailySearchError}</div>
            )}
            {isDailySearchReady && !dailySearchError && (
              <div className="text-xs text-muted-foreground">
                {isDailySearching
                  ? "Searching daily notes..."
                  : dailySearchItems.length === 0
                  ? "No matches in daily notes"
                  : `${dailySearchDates?.size ?? 0} matching days`}
              </div>
            )}
            {isDailySearchReady &&
              !isDailySearching &&
              dailySearchItems.length > 0 && (
              <div className="space-y-2">
                {dailySearchItems.map((item) => (
                  <Link
                    key={item.date}
                    to="/daily/$date"
                    params={{ date: item.date }}
                    className="block rounded-md border border-border/60 px-2 py-1 text-xs hover:border-primary transition-colors"
                  >
                    <div className="font-medium">{item.date}</div>
                    {item.snippet && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2">
                        {item.snippet}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
            </div>
          </>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function extractDailyDate(result: NoteSearchResult): string | null {
  const source = result.relativePath ?? result.title;
  const base = source.split("/").pop() ?? source;
  const match = base.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}
