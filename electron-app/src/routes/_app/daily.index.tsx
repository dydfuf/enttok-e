import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DailyNotePage } from "@/components/daily/DailyNotePage";
import { useDailyNotes } from "@/hooks/useDailyNotes";

export const Route = createFileRoute("/_app/daily/")({
  component: DailyIndexPage,
});

function DailyIndexPage() {
  const today = useMemo(() => new Date(), []);

  const { vaultPath, createOrGetDailyNote } = useDailyNotes();

  return (
    <DailyNotePage
      date={today}
      vaultPath={vaultPath}
      createOrGetDailyNote={createOrGetDailyNote}
      onErrorAction={() => window.location.reload()}
      errorActionLabel="Retry"
    />
  );
}
