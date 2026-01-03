import { useMemo } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { format, parseISO, isToday } from "date-fns";
import { Calendar } from "@/components/ui/calendar";

interface SidebarCalendarProps {
  datesWithNotes?: Set<string>;
}

const emptyNotes = new Set<string>();
const noteModifierClassNames = {
  hasNote:
    "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary data-[selected-single=true]:after:bg-primary-foreground",
};

export function SidebarCalendar({
  datesWithNotes = emptyNotes,
}: SidebarCalendarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedDate = useMemo(() => {
    const match = location.pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      return parseISO(match[1]);
    }
    if (location.pathname === "/daily" || location.pathname === "/daily/") {
      return new Date();
    }
    return new Date();
  }, [location.pathname]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    if (isToday(date)) {
      navigate({ to: "/daily" });
    } else {
      navigate({ to: "/daily/$date", params: { date: dateStr } });
    }
  };

  const modifiers = useMemo(() => {
    return {
      hasNote: (date: Date) => {
        if (datesWithNotes.size === 0) return false;
        return datesWithNotes.has(format(date, "yyyy-MM-dd"));
      },
    };
  }, [datesWithNotes]);

  return (
    <div className="space-y-2">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        modifiers={modifiers}
        modifiersClassNames={noteModifierClassNames}
        className="w-full p-0"
      />
    </div>
  );
}
