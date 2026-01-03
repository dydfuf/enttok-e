import { Link, useLocation } from "@tanstack/react-router";
import {
  Calendar,
  FolderOpen,
  Search,
  Tag,
  Network,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/daily", label: "Calendar", icon: Calendar },
  { to: "/notes", label: "Notes", icon: FolderOpen },
  { to: "/search", label: "Search", icon: Search },
  { to: "/tags", label: "Tags", icon: Tag },
  { to: "/integrations", label: "Integrations", icon: Network },
] as const;

export function NavBar() {
  const location = useLocation();

  return (
    <nav className="w-14 bg-muted/50 border-r border-border flex flex-col items-center py-4 shrink-0">
      {/* Main navigation */}
      <div className="flex flex-col space-y-2 w-full items-center">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <Link to={item.to}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-10",
                      isActive && "bg-background shadow-sm text-primary"
                    )}
                  >
                    <Icon className="size-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col space-y-2 w-full items-center pt-4 border-t border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/settings">
              <Button variant="ghost" size="icon" className="size-10">
                <Settings className="size-5" />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
