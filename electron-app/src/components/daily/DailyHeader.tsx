import { addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DailyCalendarPicker } from "./DailyCalendarPicker";

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
  const handlePrevDay = () => onNavigate(subDays(date, 1));
  const handleNextDay = () => onNavigate(addDays(date, 1));
  const handleToday = () => onNavigate(new Date());

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
        {!isToday(date) && (
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
        )}
      </div>
    </div>
  );
}
