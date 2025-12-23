import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { requireElectronAPI } from "@/lib/electron";
import type { VaultInfo } from "@/shared/electron-api";

interface VaultContextType {
  vaultPath: string | null;
  recentVaults: VaultInfo[];
  isLoading: boolean;
  isInitialized: boolean;
  selectVault: () => Promise<boolean>;
  openVault: (path: string) => Promise<boolean>;
  closeVault: () => Promise<void>;
  removeRecentVault: (path: string) => Promise<void>;
  refreshRecentVaults: () => Promise<void>;
}

const VaultContext = createContext<VaultContextType | null>(null);

interface VaultProviderProps {
  children: ReactNode;
}

export function VaultProvider({ children }: VaultProviderProps) {
  const electronAPI = useMemo(() => requireElectronAPI(), []);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [recentVaults, setRecentVaults] = useState<VaultInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        let currentVault = await electronAPI.getCurrentVault();

        // Migration from localStorage
        if (!currentVault) {
          const localStorageVault = localStorage.getItem("vault-path");
          if (localStorageVault) {
            await electronAPI.setCurrentVault(localStorageVault);
            currentVault = localStorageVault;
            localStorage.removeItem("vault-path");
          }
        }

        const recents = await electronAPI.getRecentVaults();
        setVaultPath(currentVault);
        setRecentVaults(recents);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };
    initialize();
  }, [electronAPI]);

  const refreshRecentVaults = useCallback(async () => {
    const recents = await electronAPI.getRecentVaults();
    setRecentVaults(recents);
  }, [electronAPI]);

  const selectVault = useCallback(async (): Promise<boolean> => {
    const result = await electronAPI.selectVaultFolder();
    if (result.success && result.folderPath) {
      await electronAPI.setCurrentVault(result.folderPath);
      setVaultPath(result.folderPath);
      await refreshRecentVaults();
      return true;
    }
    return false;
  }, [electronAPI, refreshRecentVaults]);

  const openVault = useCallback(
    async (path: string): Promise<boolean> => {
      await electronAPI.setCurrentVault(path);
      setVaultPath(path);
      await refreshRecentVaults();
      return true;
    },
    [electronAPI, refreshRecentVaults]
  );

  const closeVault = useCallback(async () => {
    await electronAPI.clearCurrentVault();
    setVaultPath(null);
  }, [electronAPI]);

  const removeRecentVault = useCallback(
    async (path: string) => {
      await electronAPI.removeRecentVault(path);
      await refreshRecentVaults();
    },
    [electronAPI, refreshRecentVaults]
  );

  return (
    <VaultContext.Provider
      value={{
        vaultPath,
        recentVaults,
        isLoading,
        isInitialized,
        selectVault,
        openVault,
        closeVault,
        removeRecentVault,
        refreshRecentVaults,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within VaultProvider");
  }
  return context;
}
