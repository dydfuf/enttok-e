import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FolderOpen, Trash2, Loader2 } from "lucide-react";
import { useVault } from "@/contexts/VaultContext";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: VaultSelectPage,
});

function VaultSelectPage() {
  const navigate = useNavigate();
  const {
    vaultPath,
    recentVaults,
    isLoading,
    isInitialized,
    selectVault,
    openVault,
    removeRecentVault,
  } = useVault();

  useEffect(() => {
    if (isInitialized && vaultPath) {
      navigate({ to: "/daily" });
    }
  }, [isInitialized, vaultPath, navigate]);

  const handleOpenVault = async () => {
    const success = await selectVault();
    if (success) {
      navigate({ to: "/daily" });
    }
  };

  const handleSelectRecentVault = async (path: string) => {
    const success = await openVault(path);
    if (success) {
      navigate({ to: "/daily" });
    }
  };

  const handleRemoveRecentVault = async (
    e: React.MouseEvent,
    path: string
  ) => {
    e.stopPropagation();
    await removeRecentVault(path);
  };

  if (!isInitialized || isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Welcome to Enttok-e
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Local-first work journal with AI-powered suggestions
          </p>
        </div>

        <div className="space-y-4">
          <Button onClick={handleOpenVault} className="w-full py-6" size="lg">
            <FolderOpen className="h-5 w-5 mr-2" />
            Open Vault
          </Button>
        </div>

        {recentVaults.length > 0 && (
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Recent Vaults
            </h3>
            <ul className="space-y-2">
              {recentVaults.map((vault) => (
                <li key={vault.path}>
                  <button
                    type="button"
                    onClick={() => handleSelectRecentVault(vault.path)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {vault.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {vault.path}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveRecentVault(e, vault.path)}
                      className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recentVaults.length === 0 && (
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Recent Vaults
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No recent vaults
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
