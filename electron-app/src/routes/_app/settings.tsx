import { useEffect, useMemo, useState } from "react";
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
import { useBackend } from "@/contexts/BackendContext";
import { FolderOpen, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeBinaryStatus, RuntimeStatus } from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";

type SettingsSearch = {
	tab?: string;
};

export const Route = createFileRoute("/_app/settings")({
	component: SettingsPage,
	validateSearch: (search: Record<string, unknown>): SettingsSearch => {
		return {
			tab: typeof search.tab === "string" ? search.tab : undefined,
		};
	},
});

const STATUS_LABELS: Record<string, string> = {
	stopped: "Stopped",
	starting: "Starting",
	running: "Running",
	stopping: "Stopping",
	error: "Error",
};

const STATUS_CLASSES: Record<string, string> = {
	stopped: "bg-slate-400",
	starting: "bg-amber-400",
	running: "bg-emerald-500",
	stopping: "bg-amber-400",
	error: "bg-red-500",
};

function formatRuntimeLabel(status: RuntimeBinaryStatus | null) {
	if (!status) {
		return "Checking";
	}
	if (!status.found) {
		return "Not found";
	}
	return status.version ? status.version : "Found";
}

function SettingsPage() {
	const navigate = useNavigate();
	const { tab } = Route.useSearch();
	const { vaultPath, selectVault, closeVault } = useVault();
	const { state, logs, health } = useBackend();
	const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

	const lastLogs = useMemo(() => logs.slice(-10), [logs]);
	const status = state?.status ?? "stopped";
	const statusLabel = STATUS_LABELS[status] ?? status;
	const statusClass = STATUS_CLASSES[status] ?? STATUS_CLASSES.stopped;
	const healthLabel =
		status === "running"
			? health
				? health.healthy
					? "Healthy"
					: "Unhealthy"
				: "Checking"
			: "N/A";

	useEffect(() => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		let mounted = true;
		api
			.getRuntimeStatus()
			.then((value) => {
				if (mounted) {
					setRuntime(value);
				}
			})
			.catch(() => undefined);
		api
			.checkRuntime()
			.then((value) => {
				if (mounted) {
					setRuntime(value);
				}
			})
			.catch(() => undefined);
		const off = api.onRuntimeStatus((value) => {
			setRuntime(value);
		});
		return () => {
			mounted = false;
			off();
		};
	}, []);

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
		<div className="min-h-full p-6">
			<div className="max-w-3xl mx-auto">
				<div className="mb-6">
					<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
						Settings
					</h1>
				</div>

				<Tabs defaultValue={tab ?? "general"} className="space-y-6">
					<TabsList>
						<TabsTrigger value="general">General</TabsTrigger>
						<TabsTrigger value="appearance">Appearance</TabsTrigger>
						<TabsTrigger value="templates">Templates</TabsTrigger>
						<TabsTrigger value="system">System</TabsTrigger>
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
								<CardDescription>Customize how Enttok-e looks</CardDescription>
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

					<TabsContent value="system">
						<div className="space-y-6">
							<Card>
								<CardHeader>
									<CardTitle>Backend Status</CardTitle>
									<CardDescription>
										Python FastAPI backend server status
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<span
												className={cn("h-3 w-3 rounded-full", statusClass)}
											/>
											<span className="font-medium">{statusLabel}</span>
										</div>
										<span className="text-sm text-muted-foreground">
											{healthLabel}
										</span>
									</div>
									<div className="text-sm text-muted-foreground">
										{state?.port
											? `Address: 127.0.0.1:${state.port}`
											: "No port assigned"}
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Backend Logs</CardTitle>
									<CardDescription>Recent backend log messages</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="rounded-md bg-gray-100 dark:bg-gray-900 p-3 max-h-48 overflow-y-auto">
										{lastLogs.length === 0 ? (
											<div className="text-sm text-muted-foreground text-center py-4">
												No backend logs yet
											</div>
										) : (
											<ul className="space-y-1.5">
												{lastLogs.map((log, index) => (
													<li
														key={`${log.timestamp}-${index}`}
														className="text-xs text-gray-700 dark:text-gray-300 font-mono"
													>
														<span
															className={cn(
																"mr-2 text-[10px] uppercase",
																log.level === "error"
																	? "text-red-500"
																	: log.level === "warn"
																		? "text-amber-500"
																		: "text-gray-400",
															)}
														>
															{log.level}
														</span>
														{log.message}
													</li>
												))}
											</ul>
										)}
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Runtime Dependencies</CardTitle>
									<CardDescription>
										Required runtime binaries status
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										{[
											{ label: "Node.js", status: runtime?.node ?? null },
											{ label: "npx", status: runtime?.npx ?? null },
											{ label: "Claude CLI", status: runtime?.claude ?? null },
										].map((item) => (
											<div
												key={item.label}
												className="flex items-center justify-between"
											>
												<div className="flex items-center gap-3">
													<span
														className={cn(
															"h-2.5 w-2.5 rounded-full",
															item.status
																? item.status.found
																	? "bg-emerald-500"
																	: "bg-red-500"
																: "bg-amber-400",
														)}
													/>
													<span className="text-sm">{item.label}</span>
												</div>
												<span className="text-sm text-muted-foreground">
													{formatRuntimeLabel(item.status)}
												</span>
											</div>
										))}
										{runtime?.lastCheckedAt && (
											<div className="text-xs text-muted-foreground pt-2 border-t">
												Last checked: {runtime.lastCheckedAt}
											</div>
										)}
									</div>
								</CardContent>
							</Card>
						</div>
					</TabsContent>

					<TabsContent value="about">
						<Card>
							<CardHeader>
								<CardTitle>About</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2 text-sm text-muted-foreground">
								<p>Enttok-e v0.1.0</p>
								<p>Local-first work journal with AI-powered suggestions</p>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
