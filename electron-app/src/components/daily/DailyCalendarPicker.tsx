import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DailyCalendarPickerProps {
  selectedDate: Date;
  datesWithNotes: Set<string>;
  onDateSelect: (date: Date) => void;
}

export function DailyCalendarPicker({
  selectedDate,
  datesWithNotes,
  onDateSelect,
}: DailyCalendarPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onDateSelect(date);
      setOpen(false);
    }
  };

  // Custom modifier for dates with notes
  const modifiers = {
    hasNote: (date: Date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      return datesWithNotes.has(dateStr);
    },
  };

  const modifiersClassNames = {
    hasNote:
      "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-blue-500 after:rounded-full",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal min-w-[200px]",
            !selectedDate && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(selectedDate, "yyyy년 M월 d일 (EEE)")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
