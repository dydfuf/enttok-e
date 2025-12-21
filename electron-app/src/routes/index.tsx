import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: VaultSelectPage,
});

function VaultSelectPage() {
  const navigate = useNavigate();

  const handleOpenVault = () => {
    // TODO: Implement vault selection via IPC
    navigate({ to: "/daily" });
  };

  const handleCreateVault = () => {
    // TODO: Implement vault creation via IPC
    navigate({ to: "/daily" });
  };

  return (
    <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Welcome to Enttokk-e
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Local-first work journal with AI-powered suggestions
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleOpenVault}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Open Vault
          </button>
          <button
            onClick={handleCreateVault}
            className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium rounded-lg transition-colors"
          >
            Create New Vault
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Recent Vaults
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No recent vaults
          </div>
        </div>
      </div>
    </div>
  );
}
