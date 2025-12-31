import { useCallback, useEffect, useState } from "react";
import { addDays, subDays, isToday, format } from "date-fns";
import { ChevronLeft, ChevronRight, Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DailyCalendarPicker } from "./DailyCalendarPicker";
import { useGitHub } from "@/contexts/GitHubContext";
import { formatGitHubAsMarkdown } from "@/lib/github-formatter";

interface DailyHeaderProps {
  date: Date;
  datesWithNotes: Set<string>;
  onNavigate: (date: Date) => void;
}

export function DailyHeader({
  date,
  datesWithNotes,
  onNavigate,
}: DailyHeaderProps) {
  const { status, summary, loading, refreshSummary } = useGitHub();
  const [lastFetchedDate, setLastFetchedDate] = useState<string | null>(null);

  const isConnected = status?.cli.found && status?.auth.authenticated;
  const dateStr = format(date, "yyyy-MM-dd");

  useEffect(() => {
    if (isConnected && !loading && dateStr !== lastFetchedDate) {
      refreshSummary(dateStr);
      setLastFetchedDate(dateStr);
    }
  }, [isConnected, loading, dateStr, lastFetchedDate, refreshSummary]);

  const handleInsertGitHub = useCallback(() => {
    if (!summary) return;
    const markdown = formatGitHubAsMarkdown(summary);
    if (!markdown.trim()) return;
    window.dispatchEvent(
      new CustomEvent("suggestion:apply", { detail: { text: markdown } })
    );
  }, [summary]);

  const handlePrevDay = () => onNavigate(subDays(date, 1));
  const handleNextDay = () => onNavigate(addDays(date, 1));
  const handleToday = () => onNavigate(new Date());

  const hasActivity =
    summary &&
    (summary.prs.authored.length > 0 ||
      summary.prs.reviewed.length > 0 ||
      summary.commits.length > 0);

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={handlePrevDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <DailyCalendarPicker
          selectedDate={date}
          datesWithNotes={datesWithNotes}
          onDateSelect={onNavigate}
        />

        <Button variant="ghost" size="icon" onClick={handleNextDay}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {isConnected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInsertGitHub}
                disabled={loading || !hasActivity}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Github className="h-4 w-4" />
                )}
                <span className="ml-1.5 hidden sm:inline">Insert GitHub</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasActivity
                ? "Insert today's GitHub activity"
                : "No GitHub activity for this date"}
            </TooltipContent>
          </Tooltip>
        )}
        {!isToday(date) && (
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
        )}
      </div>
    </div>
  );
}
