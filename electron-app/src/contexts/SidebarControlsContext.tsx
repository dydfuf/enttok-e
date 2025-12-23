import * as React from "react";

import { useSidebar } from "@/components/ui/sidebar";

type SidebarControlsContextValue = {
  leftToggle?: () => void;
  rightToggle?: () => void;
  registerLeft: (toggle: (() => void) | null) => void;
  registerRight: (toggle: (() => void) | null) => void;
};

const SidebarControlsContext =
  React.createContext<SidebarControlsContextValue | null>(null);

function SidebarControlsProvider({ children }: { children: React.ReactNode }) {
  const [leftToggle, setLeftToggle] = React.useState<(() => void) | null>(null);
  const [rightToggle, setRightToggle] = React.useState<(() => void) | null>(
    null
  );

  const registerLeft = React.useCallback((toggle: (() => void) | null) => {
    setLeftToggle(() => toggle);
  }, []);

  const registerRight = React.useCallback((toggle: (() => void) | null) => {
    setRightToggle(() => toggle);
  }, []);

  const value = React.useMemo(
    () => ({
      leftToggle: leftToggle ?? undefined,
      rightToggle: rightToggle ?? undefined,
      registerLeft,
      registerRight,
    }),
    [leftToggle, rightToggle, registerLeft, registerRight]
  );

  return (
    <SidebarControlsContext.Provider value={value}>
      {children}
    </SidebarControlsContext.Provider>
  );
}

function useSidebarControls() {
  const context = React.useContext(SidebarControlsContext);
  if (!context) {
    throw new Error(
      "useSidebarControls must be used within SidebarControlsProvider."
    );
  }

  return context;
}

function SidebarToggleBridge({ side }: { side: "left" | "right" }) {
  const { toggleSidebar } = useSidebar();
  const { registerLeft, registerRight } = useSidebarControls();

  React.useEffect(() => {
    if (side === "left") {
      registerLeft(toggleSidebar);
      return () => registerLeft(null);
    }

    registerRight(toggleSidebar);
    return () => registerRight(null);
  }, [registerLeft, registerRight, side, toggleSidebar]);

  return null;
}

export { SidebarControlsProvider, SidebarToggleBridge, useSidebarControls };
