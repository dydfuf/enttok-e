import { PanelLeftIcon, PanelRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebarControls } from "@/contexts/SidebarControlsContext";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPad|iPhone|iPod/.test(navigator.platform);

export default function TitleBar() {
  const { leftToggle, rightToggle } = useSidebarControls();

  return (
    <div className="h-[var(--app-titlebar-height)] bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 app-region-drag">
      <div className="grid h-full grid-cols-[auto_1fr_auto] items-center px-2">
        <div className={cn("flex items-center", isMac && "pl-16")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="app-region-no-drag"
            onClick={leftToggle}
            disabled={!leftToggle}
          >
            <PanelLeftIcon />
            <span className="sr-only">Toggle left sidebar</span>
          </Button>
        </div>
        <span className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 select-none">
          Enttok-e
        </span>
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            className="app-region-no-drag"
            onClick={rightToggle}
            disabled={!rightToggle}
          >
            <PanelRightIcon />
            <span className="sr-only">Toggle right sidebar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
