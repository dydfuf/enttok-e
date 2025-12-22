import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useVault } from "@/contexts/VaultContext";
import { FolderOpen, LogOut } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { vaultPath, selectVault, closeVault } = useVault();

  const handleSaveTemplate = () => {
    toast.success("Template saved successfully!");
  };

  const handleChangeVault = async () => {
    const success = await selectVault();
    if (success) {
      toast.success("Vault changed successfully!");
    }
  };

  const handleCloseVault = async () => {
    await closeVault();
    navigate({ to: "/" });
  };

  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Settings
          </h1>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Vault</CardTitle>
                <CardDescription>
                  Manage your notes vault location
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground mb-1">
                    Current Vault
                  </Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded mt-1 break-all">
                    {vaultPath || "No vault selected"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleChangeVault}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Change Vault
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={handleCloseVault}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Close Vault
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize how Enttokk-e looks</CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Label className="text-muted-foreground mb-2">Theme</Label>
                  <Select defaultValue="system">
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle>Daily Note Template</CardTitle>
                <CardDescription>
                  Customize the template for new daily notes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  className="font-mono min-h-[150px]"
                  defaultValue={`---
date: {{date}}
tags: [daily]
---

# {{date}}

## Today's Tasks

-

## Tomorrow's Plan

-

## Notes
`}
                />
                <Button onClick={handleSaveTemplate}>Save Template</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Enttokk-e v0.1.0</p>
                <p>Local-first work journal with AI-powered suggestions</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
