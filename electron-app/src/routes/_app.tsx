import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import AppLayout from "../components/layouts/AppLayout";
import { useVault } from "@/contexts/VaultContext";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: VaultGuard,
});

function VaultGuard() {
  const { vaultPath, isLoading, isInitialized } = useVault();
  const navigate = useNavigate();

  useEffect(() => {
    if (isInitialized && !vaultPath) {
      navigate({ to: "/" });
    }
  }, [isInitialized, vaultPath, navigate]);

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vaultPath) {
    return null;
  }

  return <AppLayout />;
}
