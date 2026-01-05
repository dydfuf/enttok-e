import { useCallback, useEffect, useState } from "react";
import { useBackend } from "@/contexts/BackendContext";
import {
	createAtlassianAccount,
	deleteAtlassianAccount,
	fetchAtlassianAccounts,
	syncAtlassianAccount,
	type AtlassianAccount,
	type AtlassianAccountCreate,
	type AtlassianService,
	type AtlassianSyncResponse,
} from "@/lib/atlassian-api";

export type UseAtlassianReturn = {
	isReady: boolean;
	accounts: AtlassianAccount[];
	isLoading: boolean;
	error: string | null;
	loadAccounts: () => Promise<AtlassianAccount[]>;
	addAccount: (payload: AtlassianAccountCreate) => Promise<AtlassianAccount>;
	removeAccount: (accountId: string) => Promise<void>;
	triggerSync: (accountId: string) => Promise<AtlassianSyncResponse>;
};

export function useAtlassian(service: AtlassianService): UseAtlassianReturn {
	const { state } = useBackend();
	const [accounts, setAccounts] = useState<AtlassianAccount[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isReady =
		state?.status === "running" && state.port !== null && state.token !== null;

	const loadAccounts = useCallback(async () => {
		if (!isReady || !state?.port || !state?.token) return [];
		setIsLoading(true);
		setError(null);
		try {
			const data = await fetchAtlassianAccounts(
				state.port,
				state.token,
				service,
			);
			setAccounts(data);
			return data;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load Atlassian accounts",
			);
			return [];
		} finally {
			setIsLoading(false);
		}
	}, [isReady, service, state?.port, state?.token]);

	const addAccount = useCallback(
		async (payload: AtlassianAccountCreate): Promise<AtlassianAccount> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}
			const account = await createAtlassianAccount(
				state.port,
				state.token,
				service,
				payload,
			);
			setAccounts((prev) => [account, ...prev]);
			return account;
		},
		[service, state?.port, state?.token],
	);

	const removeAccount = useCallback(
		async (accountId: string): Promise<void> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}
			await deleteAtlassianAccount(state.port, state.token, service, accountId);
			setAccounts((prev) => prev.filter((account) => account.account_id !== accountId));
		},
		[service, state?.port, state?.token],
	);

	const triggerSync = useCallback(
		async (accountId: string): Promise<AtlassianSyncResponse> => {
			if (!state?.port || !state?.token) {
				throw new Error("Backend not ready");
			}
			return syncAtlassianAccount(state.port, state.token, service, accountId);
		},
		[service, state?.port, state?.token],
	);

	useEffect(() => {
		if (isReady) {
			loadAccounts();
		}
	}, [isReady, loadAccounts]);

	return {
		isReady,
		accounts,
		isLoading,
		error,
		loadAccounts,
		addAccount,
		removeAccount,
		triggerSync,
	};
}
