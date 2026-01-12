import { useCallback, type ChangeEvent } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SidebarSearchProps {
  value?: string;
  onChange?: (value: string) => void;
  onFilterClick?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SidebarSearch({
  value,
  onChange,
  onFilterClick,
  placeholder = "Search memos...",
  disabled = false,
}: SidebarSearchProps) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange?.(event.target.value);
    },
    [onChange]
  );

  return (
    <div className="relative group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="pl-9 pr-9 rounded-xl bg-background"
      />
      <button
        type="button"
        onClick={onFilterClick}
        disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SlidersHorizontal className="size-4" />
      </button>
    </div>
  );
}
