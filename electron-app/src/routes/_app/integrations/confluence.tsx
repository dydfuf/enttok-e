import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	FileText,
	Loader2,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAtlassian } from "@/hooks/useAtlassian";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import { waitForBackendJob } from "@/lib/backend-jobs";
import type { ActivityEvent } from "@/lib/activity-api";

export const Route = createFileRoute("/_app/integrations/confluence")({
	component: ConfluenceIntegrationPage,
});

function normalizeOrg(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
	const withoutHostSuffix = withoutProtocol.replace(/\.atlassian\.net\/?.*$/, "");
	return withoutHostSuffix.split("/")[0];
}

function ConfluenceIntegrationPage() {
	const {
		isReady,
		accounts,
		isLoading,
		error,
		addAccount,
		removeAccount,
		triggerSync,
		loadAccounts,
	} = useAtlassian("confluence");

	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [formState, setFormState] = useState({
		org: "",
		email: "",
		apiToken: "",
	});
	const [activityRangeEnd, setActivityRangeEnd] = useState(() => new Date());

	const orgPreview = useMemo(() => {
		const normalized = normalizeOrg(formState.org);
		return normalized ? `https://${normalized}.atlassian.net` : null;
	}, [formState.org]);
	const activityRangeStart = useMemo(
		() => startOfDay(activityRangeEnd),
		[activityRangeEnd],
	);

	const {
		events: activityEvents,
		isLoading: activityLoading,
		error: activityError,
	} = useActivityEvents({
		start: activityRangeStart,
		end: activityRangeEnd,
		sources: ["confluence"],
		limit: 20,
	});

	const handleAddAccount = async () => {
		setFormError(null);
		const org = normalizeOrg(formState.org);
		if (!org || !formState.email || !formState.apiToken) {
			setFormError("Org, email, and API token are required.");
			return;
		}
		try {
			await addAccount({
				org,
				email: formState.email.trim(),
				api_token: formState.apiToken.trim(),
			});
			setAddDialogOpen(false);
			setFormState({ org: "", email: "", apiToken: "" });
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Failed to add account");
		}
	};

	const handleRemoveAccount = async (accountId: string) => {
		try {
			await removeAccount(accountId);
		} catch {
			// handled by hook error state
		}
	};

	const handleSync = async (accountId: string) => {
		setSyncingAccountId(accountId);
		setSyncError(null);
		try {
			const { job_id } = await triggerSync(accountId);
			await waitForBackendJob(job_id);
			await loadAccounts();
			setActivityRangeEnd(new Date());
		} catch (err) {
			setSyncError(
				err instanceof Error ? err.message : "Failed to sync Confluence account",
			);
		} finally {
			setSyncingAccountId(null);
		}
	};

	const handleRefreshActivity = () => {
		setActivityRangeEnd(new Date());
	};

	if (!isReady) {
		return (
			<div className="min-h-full p-6">
				<div className="max-w-3xl mx-auto">
					<div className="mb-6">
						<Link
							to="/integrations"
							className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
						>
							&larr; Back to integrations
						</Link>
						<div className="flex items-center gap-3">
							<FileText className="w-8 h-8 text-gray-900 dark:text-gray-100" />
							<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
								Confluence
							</h1>
						</div>
					</div>
					<div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
						<p className="text-yellow-700 dark:text-yellow-300 font-medium">
							Backend is not running. Please wait for it to start.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-full p-6">
			<div className="max-w-3xl mx-auto">
				<div className="mb-6">
					<Link
						to="/integrations"
						className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
					>
						&larr; Back to integrations
					</Link>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<FileText className="w-8 h-8 text-gray-900 dark:text-gray-100" />
							<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
								Confluence
							</h1>
						</div>
						<Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
							<DialogTrigger asChild>
								<Button size="sm">
									<Plus className="w-4 h-4 mr-1" />
									Add Account
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Connect Confluence</DialogTitle>
									<DialogDescription>
										Enter your org, email, and API token. Tokens are stored
										locally.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-4 mt-4">
									<div className="space-y-2">
										<Label htmlFor="confluence-org">Org</Label>
										<Input
											id="confluence-org"
											placeholder="your-org"
											value={formState.org}
											onChange={(event) =>
												setFormState((prev) => ({
													...prev,
													org: event.target.value,
												}))
											}
										/>
										{orgPreview && (
											<p className="text-xs text-muted-foreground">
												Will connect to {orgPreview}
											</p>
										)}
									</div>
									<div className="space-y-2">
										<Label htmlFor="confluence-email">Email</Label>
										<Input
											id="confluence-email"
											type="email"
											placeholder="you@company.com"
											value={formState.email}
											onChange={(event) =>
												setFormState((prev) => ({
													...prev,
													email: event.target.value,
												}))
											}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="confluence-token">API Token</Label>
										<Input
											id="confluence-token"
											type="password"
											placeholder="********"
											value={formState.apiToken}
											onChange={(event) =>
												setFormState((prev) => ({
													...prev,
													apiToken: event.target.value,
												}))
											}
										/>
									</div>
								</div>
								{formError && (
									<p className="text-sm text-red-600 dark:text-red-400">
										{formError}
									</p>
								)}
								<DialogFooter>
									<Button variant="outline" onClick={() => setAddDialogOpen(false)}>
										Cancel
									</Button>
									<Button onClick={handleAddAccount} disabled={isLoading}>
										{isLoading ? (
											<Loader2 className="w-4 h-4 animate-spin" />
										) : (
											"Connect"
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				</div>

				{(error || syncError) && (
					<div className="mb-4 space-y-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
						{error && (
							<p className="text-red-700 dark:text-red-300">{error}</p>
						)}
						{syncError && (
							<p className="text-red-700 dark:text-red-300">{syncError}</p>
						)}
					</div>
				)}

				<div className="space-y-6 mb-6">
					<ConnectionStatusCard
						accounts={accounts}
						isLoading={isLoading}
						error={error}
						onRefresh={loadAccounts}
					/>
					<TodayActivityCard
						events={activityEvents}
						isLoading={activityLoading}
						error={activityError}
						onRefresh={handleRefreshActivity}
					/>
				</div>

				{isLoading && accounts.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="w-6 h-6 animate-spin text-gray-400" />
					</div>
				) : accounts.length === 0 ? (
					<div className="space-y-6">
						<div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
							<h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
								No Confluence accounts connected
							</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
								Connect Confluence to see page updates in your stream.
							</p>
						</div>

						<div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg">
							<h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
								What we sync
							</h3>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
								<li>- Pages you create</li>
								<li>- Page updates you make</li>
								<li>- Comments you add</li>
							</ul>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						{accounts.map((account) => {
							const isSyncing = syncingAccountId === account.account_id;
							return (
								<Card key={account.account_id}>
									<CardHeader className="pb-3">
										<div className="flex items-center gap-4">
											<FileText className="w-8 h-8 text-muted-foreground" />
											<div className="flex-1">
												<CardTitle className="text-base">
													{account.org}.atlassian.net
												</CardTitle>
												<CardDescription>
													<span className="block">{account.email}</span>
													<span className="text-xs">
														{account.last_sync_at && (
															<span>
																Last sync:{" "}
																{new Date(
																	account.last_sync_at,
																).toLocaleString()}
															</span>
														)}
													</span>
												</CardDescription>
											</div>
											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => handleSync(account.account_id)}
													disabled={isSyncing}
												>
													{isSyncing ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : (
														<RefreshCw className="w-4 h-4" />
													)}
												</Button>
												<AlertDialog>
													<AlertDialogTrigger asChild>
														<Button variant="outline" size="sm">
															<Trash2 className="w-4 h-4 text-red-500" />
														</Button>
													</AlertDialogTrigger>
													<AlertDialogContent>
														<AlertDialogHeader>
															<AlertDialogTitle>
																Remove Confluence account?
															</AlertDialogTitle>
															<AlertDialogDescription>
																This will disconnect Confluence and remove synced
																activity data.
															</AlertDialogDescription>
														</AlertDialogHeader>
														<AlertDialogFooter>
															<AlertDialogCancel>Cancel</AlertDialogCancel>
															<AlertDialogAction
																onClick={() =>
																	handleRemoveAccount(account.account_id)
																}
																className="bg-red-600 hover:bg-red-700"
															>
																Remove
															</AlertDialogAction>
														</AlertDialogFooter>
													</AlertDialogContent>
												</AlertDialog>
											</div>
										</div>
									</CardHeader>
								</Card>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function formatEventTime(value: string) {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return "unknown";
	}
	return format(parsed, "HH:mm");
}

function getLatestSync(accounts: { last_sync_at?: string | null }[]): string | null {
	let latest: string | null = null;
	for (const account of accounts) {
		if (!account.last_sync_at) continue;
		if (!latest) {
			latest = account.last_sync_at;
			continue;
		}
		if (Date.parse(account.last_sync_at) > Date.parse(latest)) {
			latest = account.last_sync_at;
		}
	}
	return latest;
}

function buildOrgSummary(accounts: { org: string }[]) {
	const orgs = accounts.map((account) => account.org).filter(Boolean);
	if (orgs.length === 0) return null;
	if (orgs.length <= 2) return orgs.join(", ");
	return `${orgs[0]} +${orgs.length - 1}`;
}

type ConnectionStatusCardProps = {
	accounts: { org: string; email: string; last_sync_at?: string | null }[];
	isLoading: boolean;
	error: string | null;
	onRefresh: () => Promise<unknown>;
};

function ConnectionStatusCard({
	accounts,
	isLoading,
	error,
	onRefresh,
}: ConnectionStatusCardProps) {
	const connected = accounts.length > 0;
	const orgSummary = buildOrgSummary(accounts);
	const latestSync = getLatestSync(accounts);
	const primaryEmail = accounts[0]?.email ?? null;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center justify-between">
					Connection Status
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onRefresh}
						disabled={isLoading}
					>
						{isLoading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="h-4 w-4" />
						)}
					</Button>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<FileText className="h-4 w-4 text-muted-foreground" />
						<span className="text-sm">Confluence Account</span>
					</div>
					{connected ? (
						<div className="flex items-center gap-2">
							<CheckCircle2 className="h-4 w-4 text-green-500" />
							<span className="text-sm text-green-600 dark:text-green-400">
								Connected {orgSummary ? `(${orgSummary})` : ""}
							</span>
						</div>
					) : (
						<div className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-amber-500" />
							<span className="text-sm text-amber-600 dark:text-amber-400">
								Not connected
							</span>
						</div>
					)}
				</div>

				{primaryEmail && (
					<div className="text-xs text-muted-foreground">
						Primary: {primaryEmail}
					</div>
				)}

				<div className="text-xs text-muted-foreground">
					Last sync: {latestSync ? new Date(latestSync).toLocaleString() : "Never"}
				</div>

				{error && (
					<div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-300">{error}</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

type TodayActivityCardProps = {
	events: ActivityEvent[];
	isLoading: boolean;
	error: string | null;
	onRefresh: () => void;
};

function TodayActivityCard({
	events,
	isLoading,
	error,
	onRefresh,
}: TodayActivityCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center justify-between">
					Today&apos;s Activity
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onRefresh}
						disabled={isLoading}
					>
						{isLoading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="h-4 w-4" />
						)}
					</Button>
				</CardTitle>
				<CardDescription>
					{events.length} item{events.length === 1 ? "" : "s"}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{error && (
					<div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-300">{error}</p>
					</div>
				)}
				{events.length === 0 ? (
					<p className="text-sm text-muted-foreground">No activity yet today.</p>
				) : (
					<div className="space-y-3">
						{events.slice(0, 6).map((event) => (
							<div key={event.id} className="flex items-start justify-between gap-4">
								<div>
									<p className="text-sm font-medium">{event.title}</p>
									<p className="text-xs text-muted-foreground">
										{event.event_type}
									</p>
								</div>
								<span className="text-xs text-muted-foreground font-mono">
									{formatEventTime(event.event_time)}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
