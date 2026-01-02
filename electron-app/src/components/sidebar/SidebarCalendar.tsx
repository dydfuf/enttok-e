import { useMemo } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { format, parseISO, isSameDay, isToday as isTodayFn } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface SidebarCalendarProps {
  datesWithNotes?: string[];
}

export function SidebarCalendar({ datesWithNotes = [] }: SidebarCalendarProps) {
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
    if (isTodayFn(date)) {
      navigate({ to: "/daily" });
    } else {
      navigate({ to: "/daily/$date", params: { date: dateStr } });
    }
  };

  const modifiers = useMemo(() => {
    const withNotes = datesWithNotes.map((d) => parseISO(d));
    return {
      hasNote: withNotes,
    };
  }, [datesWithNotes]);

  return (
    <div className="space-y-2">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        modifiers={modifiers}
        modifiersClassNames={{
          hasNote: "relative",
        }}
        className="p-0 w-full"
        classNames={{
          months: "w-full",
          month: "w-full space-y-2",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-sm font-medium",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            "size-7 bg-transparent p-0 opacity-50 hover:opacity-100"
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse",
          head_row: "flex w-full",
          head_cell:
            "text-muted-foreground rounded-md w-full font-normal text-[0.8rem]",
          row: "flex w-full mt-1",
          cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 w-full aspect-square",
          day: cn(
            "size-8 p-0 font-normal aria-selected:opacity-100 w-full h-full",
            "hover:bg-accent hover:text-accent-foreground rounded-full",
            "focus:bg-accent focus:text-accent-foreground"
          ),
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground",
          day_outside: "text-muted-foreground/30",
          day_disabled: "text-muted-foreground opacity-50",
          day_hidden: "invisible",
        }}
        components={{
          DayButton: ({ day, modifiers: mods, ...props }) => {
            const hasNote = datesWithNotes.some((d) =>
              isSameDay(parseISO(d), day.date)
            );
            const isToday = isTodayFn(day.date);
            const isSelected = selectedDate && isSameDay(day.date, selectedDate);

            return (
              <button
                type="button"
                className={cn(
                  "flex flex-col items-center justify-center size-8 rounded-full text-xs font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-md",
                  isToday && !isSelected && "bg-accent text-accent-foreground",
                  mods.outside && "text-muted-foreground/30"
                )}
                {...props}
              >
                <span>{day.date.getDate()}</span>
                {hasNote && !isSelected && (
                  <span className={cn(
                    "w-1 h-1 rounded-full mt-0.5",
                    isToday ? "bg-primary" : "bg-green-500"
                  )} />
                )}
              </button>
            );
          },
        }}
      />
    </div>
  );
}
