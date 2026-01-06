import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "@/contexts/BackendContext";
import { fetchEvents, type CalendarEvent } from "@/lib/calendar-api";

export type CalendarEventsOptions = {
	start: Date;
	end: Date;
	accountId?: string;
	calendarIds?: string[];
	selectedOnly?: boolean;
	enabled?: boolean;
};

export type CalendarEventsState = {
	events: CalendarEvent[];
	isLoading: boolean;
	error: string | null;
	reload: () => Promise<void>;
};

export function useCalendarEvents(options: CalendarEventsOptions): CalendarEventsState {
	const { state } = useBackend();
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isReady =
		state?.status === "running" && state.port !== null && state.token !== null;

	const requestParams = useMemo(() => {
		return {
			start: options.start.toISOString(),
			end: options.end.toISOString(),
			account_id: options.accountId,
			calendar_ids: options.calendarIds,
			selected_only: options.selectedOnly,
		};
	}, [options.accountId, options.calendarIds, options.end, options.selectedOnly, options.start]);

	const loadEvents = useCallback(async () => {
		if (!isReady || !state?.port || !state?.token || options.enabled === false) {
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const data = await fetchEvents(state.port, state.token, requestParams);
			setEvents(data);
		} catch (err) {
			let errorMessage = "Failed to load events";
			if (err instanceof Error) {
				// Check if it's a network/CORS error
				if (err.message === "Failed to fetch") {
					errorMessage = `Network error: Unable to reach backend (port ${state.port}). Check if backend is running.`;
				} else {
					errorMessage = err.message;
				}
			}
			setError(errorMessage);
			console.error("Calendar events fetch error:", err);
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
