import { useCallback, useEffect, useMemo, useState } from "react";
import { getElectronAPI } from "@/lib/electron";

type GitHubReposState = {
	repoPaths: string[];
	loading: boolean;
	error: string | null;
	addRepo: () => Promise<void>;
	removeRepo: (repoPath: string) => Promise<void>;
	reload: () => Promise<void>;
};

export function useGitHubRepos(): GitHubReposState {
	const electronAPI = useMemo(() => getElectronAPI(), []);
	const [repoPaths, setRepoPaths] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		if (!electronAPI) return;
		setError(null);
		try {
			const paths = await electronAPI.getGitHubRepoPaths();
			setRepoPaths(paths);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load repos");
		}
	}, [electronAPI]);

	const persistRepoPaths = useCallback(
		async (paths: string[]) => {
			if (!electronAPI) return;
			await electronAPI.setGitHubRepoPaths(paths);
			setRepoPaths(paths);
		},
		[electronAPI],
	);

	const addRepo = useCallback(async () => {
		if (!electronAPI) return;
		setError(null);
		setLoading(true);
		try {
			const result = await electronAPI.selectGitHubRepoFolder();
			if (!result?.success || !result.folderPath) {
				return;
			}
			const nextPaths = Array.from(
				new Set([...repoPaths, result.folderPath]),
			);
			await persistRepoPaths(nextPaths);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add repo");
		} finally {
			setLoading(false);
		}
	}, [electronAPI, repoPaths, persistRepoPaths]);

	const removeRepo = useCallback(
		async (repoPath: string) => {
			setError(null);
			setLoading(true);
			try {
				const nextPaths = repoPaths.filter((path) => path !== repoPath);
				await persistRepoPaths(nextPaths);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to remove repo",
				);
			} finally {
				setLoading(false);
			}
		},
		[repoPaths, persistRepoPaths],
	);

	useEffect(() => {
		reload();
	}, [reload]);

	return {
		repoPaths,
		loading,
		error,
		addRepo,
		removeRepo,
		reload,
	};
}
