import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SidebarSearchProps {
  value?: string;
  onChange?: (value: string) => void;
  onFilterClick?: () => void;
}

export function SidebarSearch({ value, onChange, onFilterClick }: SidebarSearchProps) {
  return (
    <div className="relative group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <Input
        type="text"
        placeholder="Search memos..."
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="pl-9 pr-9 rounded-xl bg-background"
      />
      <button
        type="button"
        onClick={onFilterClick}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
      >
        <SlidersHorizontal className="size-4" />
      </button>
    </div>
  );
}
