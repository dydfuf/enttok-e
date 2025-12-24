import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, RefreshCw, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
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
import { useCalendar } from "@/hooks/useCalendar";
import type { CalendarProvider } from "@/lib/calendar-api";

export const Route = createFileRoute("/_app/integrations/calendar")({
	component: CalendarIntegrationPage,
});

function CalendarIntegrationPage() {
	const {
		isReady,
		providers,
		accounts,
		isLoading,
		error,
		pendingOAuth,
		addAccount,
		removeAccount,
		triggerSync,
		getProviderById,
		connectGoogle,
		cancelOAuth,
	} = useCalendar();

	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

	const handleAddAccount = async (provider: CalendarProvider) => {
		try {
			if (provider === "google") {
				// Start Google OAuth flow
				await connectGoogle();
				setAddDialogOpen(false);
				// The hook will poll for new accounts automatically
			} else {
				// For other providers, use the simple add flow
				const providerInfo = getProviderById(provider);
				await addAccount({
					provider,
					display_name: providerInfo?.label ?? provider,
				});
				setAddDialogOpen(false);
			}
		} catch (err) {
			console.error("Failed to add account:", err);
		}
	};

	const handleRemoveAccount = async (accountId: string) => {
		try {
			await removeAccount(accountId);
		} catch (err) {
			console.error("Failed to remove account:", err);
		}
	};

	const handleSync = async (accountId: string) => {
		setSyncingAccountId(accountId);
		try {
			await triggerSync(accountId);
		} catch (err) {
			console.error("Failed to sync:", err);
		} finally {
			setSyncingAccountId(null);
		}
	};

	if (!isReady) {
		return (
			<div className="h-full p-6">
				<div className="max-w-3xl mx-auto">
					<div className="mb-6">
						<Link
							to="/integrations"
							className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
						>
							&larr; Back to integrations
						</Link>
						<div className="flex items-center gap-3">
							<CalendarDays className="w-8 h-8 text-gray-900 dark:text-gray-100" />
							<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
								Calendar
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
		<div className="h-full p-6">
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
							<CalendarDays className="w-8 h-8 text-gray-900 dark:text-gray-100" />
							<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
								Calendar
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
									<DialogTitle>Add Calendar Account</DialogTitle>
									<DialogDescription>
										Choose a calendar provider to connect.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-3 mt-4">
									{providers.map((provider) => (
										<button
											key={provider.id}
											onClick={() => handleAddAccount(provider.id)}
											className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
										>
											<div className="font-medium text-gray-900 dark:text-gray-100">
												{provider.label}
											</div>
											<div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
												{provider.auth_method === "oauth2_pkce"
													? "OAuth 2.0 authentication"
													: "CalDAV with app-specific password"}
											</div>
										</button>
									))}
								</div>
							</DialogContent>
						</Dialog>
					</div>
				</div>

				{/* OAuth in Progress Dialog */}
				<Dialog open={!!pendingOAuth} onOpenChange={() => cancelOAuth()}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Connecting to Google Calendar</DialogTitle>
							<DialogDescription>
								A browser window has opened for Google sign-in. Please complete
								the authorization in your browser.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center py-8">
							<Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
							<p className="text-sm text-gray-500">
								Waiting for authorization...
							</p>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={cancelOAuth}>
								Cancel
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{error && (
					<div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
						<p className="text-red-700 dark:text-red-300">{error}</p>
					</div>
				)}

				{isLoading && accounts.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="w-6 h-6 animate-spin text-gray-400" />
					</div>
				) : accounts.length === 0 ? (
					<div className="space-y-6">
						<div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
							<h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
								No calendar accounts connected
							</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
								Connect your Google Calendar or Apple Calendar to sync your
								events.
							</p>
						</div>

						<div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg">
							<h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
								What we sync
							</h3>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
								<li>- Calendar events and meetings</li>
								<li>- Event details (title, time, location)</li>
								<li>- Recurring event schedules</li>
							</ul>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						{accounts.map((account) => {
							const providerInfo = getProviderById(account.provider);
							const isSyncing = syncingAccountId === account.account_id;

							return (
								<Card key={account.account_id}>
									<CardHeader className="pb-3">
										<div className="flex items-center gap-4">
											<CalendarDays className="w-8 h-8 text-muted-foreground" />
											<div className="flex-1">
												<CardTitle className="text-base">
													{account.display_name ||
														providerInfo?.label ||
														account.provider}
												</CardTitle>
												<CardDescription>
													{account.email && (
														<span className="block">{account.email}</span>
													)}
													<span className="text-xs">
														{account.connected ? (
															<span className="text-green-600 dark:text-green-400">
																Connected
															</span>
														) : (
															<span className="text-yellow-600 dark:text-yellow-400">
																Not authenticated
															</span>
														)}
														{account.last_sync_at && (
															<span className="ml-2">
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
																Remove Calendar Account?
															</AlertDialogTitle>
															<AlertDialogDescription>
																This will disconnect the calendar account and
																remove all synced data. This action cannot be
																undone.
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
