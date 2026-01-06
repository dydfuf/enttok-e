import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import {
	DEFAULT_ASSETS_FOLDER,
	DEFAULT_DAILY_FOLDER,
	joinPath,
	validateAssetsFolder,
	validateDailyFolder,
} from "@/lib/vault-paths";
import type {
	RuntimeBinaryStatus,
	RuntimeStatus,
	WorkTimeNotificationSettings,
} from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";
import { Switch } from "@/components/ui/switch";

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

const DEFAULT_DAILY_NOTE_TEMPLATE = `---
date: {{date}}
tags: [daily]
---

# {{date}}

## Today's Tasks

-

## Tomorrow's Plan

-

## Notes
`;

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
	const [dailyFolder, setDailyFolder] = useState(DEFAULT_DAILY_FOLDER);
	const [dailyFolderInput, setDailyFolderInput] = useState(
		DEFAULT_DAILY_FOLDER,
	);
	const [assetsFolder, setAssetsFolder] = useState(DEFAULT_ASSETS_FOLDER);
	const [assetsFolderInput, setAssetsFolderInput] = useState(
		DEFAULT_ASSETS_FOLDER,
	);
	const [dailyTemplate, setDailyTemplate] = useState(
		DEFAULT_DAILY_NOTE_TEMPLATE,
	);
	const [dailyTemplateInput, setDailyTemplateInput] = useState(
		DEFAULT_DAILY_NOTE_TEMPLATE,
	);
	const [notificationSettings, setNotificationSettings] =
		useState<WorkTimeNotificationSettings>({
			enabled: false,
			workStartTime: null,
			workEndTime: null,
			workStartMessage: "출근 시간입니다! 오늘의 업무를 정리해보세요.",
			workEndMessage: "퇴근 시간입니다! 오늘 하루를 마무리해보세요.",
		});
	const [savedNotificationSettings, setSavedNotificationSettings] =
		useState<WorkTimeNotificationSettings | null>(null);

	const lastLogs = useMemo(() => logs.slice(-10), [logs]);
	const dailyFolderValidation = useMemo(
		() => validateDailyFolder(dailyFolderInput),
		[dailyFolderInput],
	);
	const dailyFolderDirty = dailyFolderValidation.normalized !== dailyFolder;
	const assetsFolderValidation = useMemo(
		() => validateAssetsFolder(assetsFolderInput),
		[assetsFolderInput],
	);
	const assetsFolderDirty =
		assetsFolderValidation.normalized !== assetsFolder;
	const dailyTemplateDirty = dailyTemplateInput !== dailyTemplate;
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
	const notificationsDirty =
		savedNotificationSettings !== null &&
		JSON.stringify(notificationSettings) !==
			JSON.stringify(savedNotificationSettings);

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

	useEffect(() => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		let mounted = true;
		api
			.getDailyNotesFolder()
			.then((value) => {
				if (!mounted) {
					return;
				}
				const validation = validateDailyFolder(value);
				setDailyFolder(validation.normalized);
				setDailyFolderInput(validation.normalized);
			})
			.catch(() => undefined);
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		let mounted = true;
		api
			.getAssetsFolder()
			.then((value) => {
				if (!mounted) {
					return;
				}
				const validation = validateAssetsFolder(value);
				setAssetsFolder(validation.normalized);
				setAssetsFolderInput(validation.normalized);
			})
			.catch(() => undefined);
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		let mounted = true;
		api
			.getDailyNoteTemplate()
			.then((value) => {
				if (!mounted) {
					return;
				}
				setDailyTemplate(value);
				setDailyTemplateInput(value);
			})
			.catch(() => undefined);
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		let mounted = true;
		api
			.getWorkTimeNotifications()
			.then((value) => {
				if (!mounted) {
					return;
				}
				setNotificationSettings(value);
				setSavedNotificationSettings(value);
			})
			.catch(() => undefined);
		return () => {
			mounted = false;
		};
	}, []);

	const handleSaveTemplate = async () => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		try {
			await api.setDailyNoteTemplate(dailyTemplateInput);
			setDailyTemplate(dailyTemplateInput);
			toast.success("Template saved successfully!");
		} catch {
			toast.error("Failed to save template");
		}
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

	const handleSaveDailyFolder = async () => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		if (!dailyFolderValidation.valid) {
			toast.error(
				dailyFolderValidation.error || "Invalid daily notes folder",
			);
			return;
		}
		await api.setDailyNotesFolder(dailyFolderValidation.normalized);
		setDailyFolder(dailyFolderValidation.normalized);
		setDailyFolderInput(dailyFolderValidation.normalized);
		toast.success("Daily notes folder updated");
	};

	const handleSaveAssetsFolder = async () => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		if (!assetsFolderValidation.valid) {
			toast.error(assetsFolderValidation.error || "Invalid assets folder");
			return;
		}
		await api.setAssetsFolder(assetsFolderValidation.normalized);
		setAssetsFolder(assetsFolderValidation.normalized);
		setAssetsFolderInput(assetsFolderValidation.normalized);
		toast.success("Assets folder updated");
	};

	const handleSaveNotifications = async () => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		try {
			const result = await api.setWorkTimeNotifications(notificationSettings);
			if (!result.success) {
				toast.error("알림 설정 저장에 실패했습니다");
				return;
			}
			setSavedNotificationSettings(notificationSettings);
			toast.success("알림 설정이 저장되었습니다!");
		} catch {
			toast.error("알림 설정 저장에 실패했습니다");
		}
	};

	const handleTestNotification = async () => {
		const api = getElectronAPI();
		if (!api) {
			return;
		}
		try {
			await api.testNotification();
			toast.success("테스트 알림을 발송했습니다!");
		} catch {
			toast.error("테스트 알림 발송에 실패했습니다");
		}
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
						<TabsTrigger value="notifications">Notifications</TabsTrigger>
						<TabsTrigger value="appearance">Appearance</TabsTrigger>
						<TabsTrigger value="templates">Templates</TabsTrigger>
						<TabsTrigger value="system">System</TabsTrigger>
						<TabsTrigger value="about">About</TabsTrigger>
					</TabsList>

					<TabsContent value="general">
						<div className="space-y-6">
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
							<Card>
								<CardHeader>
									<CardTitle>Daily Notes</CardTitle>
									<CardDescription>
										Choose where daily notes are stored
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3">
									<div>
										<Label className="text-muted-foreground mb-1">
											Daily Notes Folder
										</Label>
										<Input
											value={dailyFolderInput}
											onChange={(e) => setDailyFolderInput(e.target.value)}
											placeholder={DEFAULT_DAILY_FOLDER}
										/>
										<p className="text-xs text-muted-foreground mt-2">
											Relative to the vault root. Example: daily or
											journal/daily.
										</p>
										{!dailyFolderValidation.valid && (
											<p className="text-xs text-destructive mt-2">
												{dailyFolderValidation.error}
											</p>
										)}
									</div>
									<div>
										<Label className="text-muted-foreground mb-1">
											Resolved Path
										</Label>
										<p className="text-sm font-mono bg-muted p-2 rounded mt-1 break-all">
											{vaultPath
												? joinPath(vaultPath, dailyFolder)
												: "No vault selected"}
										</p>
									</div>
									<Button
										onClick={handleSaveDailyFolder}
										disabled={
											!dailyFolderDirty ||
											!dailyFolderValidation.valid
										}
									>
										Save Daily Notes Folder
									</Button>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle>Assets</CardTitle>
									<CardDescription>
										Control where pasted images are stored
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3">
									<div>
										<Label className="text-muted-foreground mb-1">
											Assets Folder
										</Label>
										<Input
											value={assetsFolderInput}
											onChange={(e) => setAssetsFolderInput(e.target.value)}
											placeholder={DEFAULT_ASSETS_FOLDER}
										/>
										<p className="text-xs text-muted-foreground mt-2">
											Relative to the vault root. Example: assets or
											assets/images.
										</p>
										{!assetsFolderValidation.valid && (
											<p className="text-xs text-destructive mt-2">
												{assetsFolderValidation.error}
											</p>
										)}
									</div>
									<div>
										<Label className="text-muted-foreground mb-1">
											Resolved Path
										</Label>
										<p className="text-sm font-mono bg-muted p-2 rounded mt-1 break-all">
											{vaultPath
												? joinPath(vaultPath, assetsFolder)
												: "No vault selected"}
										</p>
									</div>
									<Button
										onClick={handleSaveAssetsFolder}
										disabled={
											!assetsFolderDirty ||
											!assetsFolderValidation.valid
										}
									>
										Save Assets Folder
									</Button>
								</CardContent>
							</Card>
						</div>
					</TabsContent>

					<TabsContent value="notifications">
						<Card>
							<CardHeader>
								<CardTitle>출퇴근 알림</CardTitle>
								<CardDescription>
									출근/퇴근 시간에 알림을 받아 업무를 정리하세요
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>알림 활성화</Label>
										<p className="text-sm text-muted-foreground">
											출퇴근 시간 알림을 켜거나 끕니다
										</p>
									</div>
									<Switch
										checked={notificationSettings.enabled}
										onCheckedChange={(checked) => {
											setNotificationSettings((prev) => ({
												...prev,
												enabled: checked,
											}));
										}}
									/>
								</div>

								<div className="space-y-2">
									<Label>출근 시간</Label>
									<Input
										type="time"
										value={notificationSettings.workStartTime ?? ""}
										onChange={(e) => {
											setNotificationSettings((prev) => ({
												...prev,
												workStartTime: e.target.value || null,
											}));
										}}
										disabled={!notificationSettings.enabled}
									/>
								</div>

								<div className="space-y-2">
									<Label>출근 알림 메시지</Label>
									<Textarea
										value={notificationSettings.workStartMessage}
										onChange={(e) => {
											setNotificationSettings((prev) => ({
												...prev,
												workStartMessage: e.target.value,
											}));
										}}
										disabled={!notificationSettings.enabled}
										className="min-h-[80px]"
									/>
								</div>

								<div className="space-y-2">
									<Label>퇴근 시간</Label>
									<Input
										type="time"
										value={notificationSettings.workEndTime ?? ""}
										onChange={(e) => {
											setNotificationSettings((prev) => ({
												...prev,
												workEndTime: e.target.value || null,
											}));
										}}
										disabled={!notificationSettings.enabled}
									/>
								</div>

								<div className="space-y-2">
									<Label>퇴근 알림 메시지</Label>
									<Textarea
										value={notificationSettings.workEndMessage}
										onChange={(e) => {
											setNotificationSettings((prev) => ({
												...prev,
												workEndMessage: e.target.value,
											}));
										}}
										disabled={!notificationSettings.enabled}
										className="min-h-[80px]"
									/>
								</div>

								<div className="flex gap-2">
									<Button
										onClick={handleSaveNotifications}
										disabled={!notificationsDirty}
									>
										설정 저장
									</Button>
									<Button
										variant="outline"
										onClick={handleTestNotification}
									>
										테스트 알림
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
									value={dailyTemplateInput}
									onChange={(e) => setDailyTemplateInput(e.target.value)}
								/>
								<Button
									onClick={handleSaveTemplate}
									disabled={!dailyTemplateDirty}
								>
									Save Template
								</Button>
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
