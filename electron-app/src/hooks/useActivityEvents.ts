import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "@/contexts/BackendContext";
import { fetchActivityEvents, type ActivityEvent } from "@/lib/activity-api";

export type ActivityEventsOptions = {
	start: Date;
	end: Date;
	sources?: string[];
	enabled?: boolean;
	limit?: number;
};

export type ActivityEventsState = {
	events: ActivityEvent[];
	isLoading: boolean;
	error: string | null;
	reload: () => Promise<void>;
};

export function useActivityEvents(
	options: ActivityEventsOptions,
): ActivityEventsState {
	const { state } = useBackend();
	const [events, setEvents] = useState<ActivityEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isReady =
		state?.status === "running" && state.port !== null && state.token !== null;

	const sourcesKey = options.sources?.join(",") ?? "";
	const requestParams = useMemo(() => {
		return {
			start: options.start.toISOString(),
			end: options.end.toISOString(),
			sources: sourcesKey ? sourcesKey.split(",") : undefined,
			limit: options.limit,
		};
	}, [options.end, options.limit, options.start, sourcesKey]);

	const loadEvents = useCallback(async () => {
		if (!isReady || !state?.port || !state?.token || options.enabled === false) {
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const data = await fetchActivityEvents(
				state.port,
				state.token,
				requestParams,
			);
			setEvents(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load activity events",
			);
		} finally {
			setIsLoading(false);
		}
	}, [isReady, options.enabled, requestParams, state?.port, state?.token]);

	useEffect(() => {
		loadEvents();
	}, [loadEvents]);

	return {
		events,
		isLoading,
		error,
		reload: loadEvents,
	};
}
