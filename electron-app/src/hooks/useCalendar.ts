import { useState, useCallback, useEffect } from "react";
import { useBackend } from "@/contexts/BackendContext";
import {
	fetchProviders,
	fetchAccounts,
	createAccount,
	deleteAccount,
	syncAccount,
	startGoogleOAuth,
	completeGoogleOAuth,
	type CalendarProvider,
	type CalendarProviderInfo,
	type CalendarAccount,
	type CalendarAccountCreate,
	type OAuthStartResponse,
} from "@/lib/calendar-api";

export interface UseCalendarReturn {
	isReady: boolean;
	providers: CalendarProviderInfo[];
	accounts: CalendarAccount[];
	isLoading: boolean;
	error: string | null;
	pendingOAuth: OAuthStartResponse | null;
	loadProviders: () => Promise<void>;
	loadAccounts: () => Promise<void>;
	addAccount: (payload: CalendarAccountCreate) => Promise<CalendarAccount>;
	removeAccount: (accountId: string) => Promise<void>;
	triggerSync: (accountId: string) => Promise<{ job_id: string }>;
	getProviderById: (id: CalendarProvider) => CalendarProviderInfo | undefined;
	connectGoogle: () => Promise<OAuthStartResponse>;
	finishGoogleAuth: (code: string) => Promise<CalendarAccount>;
	cancelOAuth: () => void;
}

export function useCalendar(): UseCalendarReturn {
	const { state } = useBackend();
	const [providers, setProviders] = useState<CalendarProviderInfo[]>([]);
	const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingOAuth, setPendingOAuth] = useState<OAuthStartResponse | null>(
		null,
	);

	const isReady =
		state?.status === "running" && state.port !== null && state.token !== null;

	const loadProviders = useCallback(async () => {
		if (!isReady || !state?.port || !state?.token) return;

		setIsLoading(true);
		setError(null);
		try {
			const data = await fetchProviders(state.port, state.token);
			setProviders(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load providers");
		} finally {
			setIsLoading(false);
		}
	}, [isReady, state?.port, state?.token]);

	const loadAccounts = useCallback(async () => {
		if (!isReady || !state?.port || !state?.token) return;

		setIsLoading(true);
		setError(null);
		try {
			const data = await fetchAccounts(state.port, state.token);
			setAccounts(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load accounts");
		} finally {
			setIsLoading(false);
		}
	}, [isReady, state?.port, state?.token]);

	const addAccount = useCallback(
		async (payload: CalendarAccountCreate): Promise<CalendarAccount> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}

			const account = await createAccount(state.port, state.token, payload);
			setAccounts((prev) => [account, ...prev]);
			return account;
		},
		[state?.port, state?.token],
	);

	const removeAccount = useCallback(
		async (accountId: string): Promise<void> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}

			await deleteAccount(state.port, state.token, accountId);
			setAccounts((prev) => prev.filter((a) => a.account_id !== accountId));
		},
		[state?.port, state?.token],
	);

	const triggerSync = useCallback(
		async (accountId: string): Promise<{ job_id: string }> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}

			return syncAccount(state.port, state.token, accountId);
		},
		[state?.port, state?.token],
	);

	const getProviderById = useCallback(
		(id: CalendarProvider): CalendarProviderInfo | undefined => {
			return providers.find((p) => p.id === id);
		},
		[providers],
	);

	// Google OAuth: Start the flow and open browser
	const connectGoogle = useCallback(async (): Promise<OAuthStartResponse> => {
		if (!state?.port || !state?.token) {
			throw new Error("Backend not ready");
		}

		setIsLoading(true);
		setError(null);
		try {
			const oauthData = await startGoogleOAuth(state.port, state.token);
			setPendingOAuth(oauthData);

			// Open browser to auth URL
			window.open(oauthData.auth_url, "_blank");

			// Start polling for new accounts (backend handles the callback)
			const pollInterval = setInterval(async () => {
				try {
					const newAccounts = await fetchAccounts(state.port!, state.token!);
					if (newAccounts.length > accounts.length) {
						// New account added, stop polling
						clearInterval(pollInterval);
						setAccounts(newAccounts);
						setPendingOAuth(null);
						setIsLoading(false);
					}
				} catch {
					// Ignore polling errors
				}
			}, 2000);

			// Stop polling after 5 minutes
			setTimeout(() => {
				clearInterval(pollInterval);
				if (pendingOAuth) {
					setPendingOAuth(null);
					setIsLoading(false);
				}
			}, 5 * 60 * 1000);

			return oauthData;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to start Google OAuth";
			setError(message);
			setIsLoading(false);
			throw err;
		}
	}, [state?.port, state?.token, accounts.length, pendingOAuth]);

	// Google OAuth: Complete the flow with authorization code (legacy - kept for compatibility)
	const finishGoogleAuth = useCallback(
		async (code: string): Promise<CalendarAccount> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}
			if (!pendingOAuth) {
				throw new Error("No pending OAuth flow");
			}

			setIsLoading(true);
			setError(null);
			try {
				const result = await completeGoogleOAuth(
					state.port,
					state.token,
					code,
					pendingOAuth.state,
				);
				setPendingOAuth(null);
				setAccounts((prev) => [result.account, ...prev]);
				return result.account;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to complete Google OAuth";
				setError(message);
				throw err;
			} finally {
				setIsLoading(false);
			}
		},
		[state?.port, state?.token, pendingOAuth],
	);

	// Cancel pending OAuth
	const cancelOAuth = useCallback(() => {
		setPendingOAuth(null);
		setError(null);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		if (isReady) {
			loadProviders();
			loadAccounts();
		}
	}, [isReady, loadProviders, loadAccounts]);

	return {
		isReady,
		providers,
		accounts,
		isLoading,
		error,
		pendingOAuth,
		loadProviders,
		loadAccounts,
		addAccount,
		removeAccount,
		triggerSync,
		getProviderById,
		connectGoogle,
		finishGoogleAuth,
		cancelOAuth,
	};
}
