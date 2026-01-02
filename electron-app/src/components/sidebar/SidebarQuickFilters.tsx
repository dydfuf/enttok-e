import { Link2, CheckSquare, Code } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilterCounts {
  links: number;
  todos: { completed: number; total: number };
  code: number;
}

interface SidebarQuickFiltersProps {
  counts?: FilterCounts;
  activeFilter?: "links" | "todos" | "code" | null;
  onFilterChange?: (filter: "links" | "todos" | "code" | null) => void;
}

export function SidebarQuickFilters({
  counts = { links: 0, todos: { completed: 0, total: 0 }, code: 0 },
  activeFilter,
  onFilterChange,
}: SidebarQuickFiltersProps) {
  const filters = [
    {
      id: "links" as const,
      icon: Link2,
      label: "Links",
      count: counts.links.toString(),
    },
    {
      id: "todos" as const,
      icon: CheckSquare,
      label: "To-do",
      count: `${counts.todos.completed}/${counts.todos.total}`,
    },
    {
      id: "code" as const,
      icon: Code,
      label: "Code",
      count: counts.code.toString(),
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => {
        const Icon = filter.icon;
        const isActive = activeFilter === filter.id;
        return (
          <Button
            key={filter.id}
            variant={isActive ? "secondary" : "outline"}
            size="sm"
            className="h-8 text-xs gap-1.5 px-3"
            onClick={() => onFilterChange?.(isActive ? null : filter.id)}
          >
            <Icon className="size-3.5" />
            <span>{filter.label}</span>
            <span className="opacity-60">{filter.count}</span>
          </Button>
        );
      })}
    </div>
  );
}
