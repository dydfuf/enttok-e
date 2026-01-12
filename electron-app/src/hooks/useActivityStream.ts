import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfDay, format, formatDistanceToNow, isToday, isValid, parseISO, startOfDay } from "date-fns";
import { useGitHub } from "@/contexts/GitHubContext";
import { useClaudeSessions } from "@/contexts/ClaudeSessionsContext";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import { useCalendar } from "@/hooks/useCalendar";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import type { CalendarEvent } from "@/lib/calendar-api";
import {
	normalizeActivitySource,
	type ActivityStreamEntry,
	type ActivityStreamItem,
} from "@/lib/activity-types";

const MAX_ACTIVITY_ITEMS = 50;

type ActivityEntryInput = Omit<ActivityStreamEntry, "timeLabel">;

type ActivityStreamState = {
	activities: ActivityStreamItem[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
};

function toTimestamp(value?: string | null): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function formatRelativeTime(timestamp: number): string {
	if (!Number.isFinite(timestamp)) {
		return "unknown";
	}
	return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

function buildActivityEntry(
	input: ActivityEntryInput,
): ActivityStreamEntry {
	return {
		...input,
		timeLabel: formatRelativeTime(input.timestamp),
	};
}

function formatCalendarDetails(event: CalendarEvent): string {
	const parts: string[] = [];

	if (event.all_day) {
		parts.push("All day");
	} else {
		const start = parseISO(event.start_time);
		const end = parseISO(event.end_time);
		if (isValid(start) && isValid(end)) {
			parts.push(`${format(start, "HH:mm")}-${format(end, "HH:mm")}`);
		} else {
			parts.push("Time unavailable");
		}
	}

	if (event.calendar_name) {
		parts.push(event.calendar_name);
	}

	if (event.location) {
		parts.push(event.location);
	}

	return parts.join(" | ");
}

type UseActivityStreamOptions = {
	selectedDate?: Date;
};

export function useActivityStream(options: UseActivityStreamOptions = {}): ActivityStreamState {
	const { selectedDate } = options;

	const {
		summary,
		loading: gitHubLoading,
		error: gitHubError,
		refresh: refreshGitHub,
		refreshSummary,
	} = useGitHub();

	const {
		sessions: claudeSessions,
		loading: claudeLoading,
		error: claudeError,
		refreshSessions: refreshClaudeSessions,
	} = useClaudeSessions();

	const { primaryCalendarIds } = useCalendar();

	const [now, setNow] = useState(() => new Date());

	// Use selected date or today
	const targetDate = selectedDate ?? now;

	// Range: start of selected day to end of day (or current time if today)
	const rangeStart = useMemo(() => startOfDay(targetDate), [targetDate]);
	const rangeEnd = useMemo(() => {
		if (isToday(targetDate)) {
			return now;
		}
		return endOfDay(targetDate);
	}, [targetDate, now]);

	const hasRequestedSummary = useRef(false);

	const {
		events,
		isLoading: calendarLoading,
		error: calendarError,
		reload: reloadCalendar,
	} = useCalendarEvents({
		start: rangeStart,
		end: rangeEnd,
		calendarIds: primaryCalendarIds,
		selectedOnly: true,
		enabled: primaryCalendarIds.length > 0,
	});
	const {
		events: activityEvents,
		isLoading: activityLoading,
		error: activityError,
		reload: reloadActivity,
	} = useActivityEvents({
		start: rangeStart,
		end: rangeEnd,
		sources: ["jira", "confluence"],
		limit: MAX_ACTIVITY_ITEMS,
	});

	useEffect(() => {
		if (!summary && !hasRequestedSummary.current) {
			hasRequestedSummary.current = true;
			refreshSummary();
		}
	}, [summary, refreshSummary]);

	const refresh = useCallback(async () => {
		setNow(new Date());
		await Promise.allSettled([
			refreshGitHub(),
			refreshSummary(),
			reloadCalendar(),
			reloadActivity(),
			refreshClaudeSessions(),
		]);
	}, [refreshGitHub, refreshSummary, reloadActivity, reloadCalendar, refreshClaudeSessions]);

	const calendarEntries = useMemo<ActivityStreamEntry[]>(() => {
		return events
			.map((event) => {
				const timestamp = toTimestamp(event.start_time);
				if (!timestamp) return null;

				return buildActivityEntry({
					id: `calendar:${event.calendar_id}:${event.event_id}`,
					title: event.title || "Untitled event",
					description: formatCalendarDetails(event),
					source: "calendar",
					timestamp,
				});
			})
			.filter((entry): entry is ActivityStreamEntry => Boolean(entry));
	}, [events]);

	const gitHubEntries = useMemo<ActivityStreamEntry[]>(() => {
		if (!summary) return [];

		const entries: ActivityStreamEntry[] = [];
		const seen = new Set<string>();
		const rangeStartMs = rangeStart.getTime();
		const rangeEndMs = rangeEnd.getTime();

		const pushEntry = (entry: ActivityEntryInput) => {
			if (entry.timestamp < rangeStartMs || entry.timestamp > rangeEndMs) {
				return;
			}
			if (seen.has(entry.id)) return;
			seen.add(entry.id);
			entries.push(buildActivityEntry(entry));
		};

		for (const pr of summary.prs.authored) {
			const timestamp = toTimestamp(pr.updatedAt ?? pr.createdAt);
			if (!timestamp) continue;
			const stateLabel = pr.state ? pr.state.toLowerCase() : "unknown";
			pushEntry({
				id: `github:pr:authored:${pr.repository}:${pr.number}`,
				title: `PR #${pr.number}: ${pr.title}`,
				description: `Authored (${stateLabel}) in ${pr.repository}`,
				source: "github",
				timestamp,
			});
		}

		for (const pr of summary.prs.reviewed) {
			const timestamp = toTimestamp(pr.updatedAt ?? pr.createdAt);
			if (!timestamp) continue;
			const stateLabel = pr.state ? pr.state.toLowerCase() : "unknown";
			pushEntry({
				id: `github:pr:reviewed:${pr.repository}:${pr.number}`,
				title: `PR #${pr.number}: ${pr.title}`,
				description: `Reviewed (${stateLabel}) in ${pr.repository}`,
				source: "github",
				timestamp,
			});
		}

		for (const commit of summary.commits) {
			const timestamp = toTimestamp(commit.createdAt);
			if (!timestamp) continue;
			pushEntry({
				id: `github:commit:${commit.repository}:${commit.sha}`,
				title: commit.message,
				description: `${commit.repository} (${commit.sha})`,
				source: "github",
				timestamp,
			});
		}

		return entries;
	}, [summary, rangeEnd, rangeStart]);

	const atlassianEntries = useMemo<ActivityStreamEntry[]>(() => {
		return activityEvents
			.map((event) => {
				const timestamp = toTimestamp(event.event_time);
				if (!timestamp) return null;
				const descriptionParts = [];
				if (event.actor) {
					descriptionParts.push(event.actor);
				}
				if (event.description) {
					descriptionParts.push(event.description);
				}
				const description = descriptionParts.join(" | ") || "Activity";

				return buildActivityEntry({
					id: `atlassian:${event.source}:${event.id}`,
					title: event.title || "Untitled activity",
					description,
					source: normalizeActivitySource(event.source),
					timestamp,
				});
			})
			.filter((entry): entry is ActivityStreamEntry => Boolean(entry));
	}, [activityEvents]);

	const claudeEntries = useMemo<ActivityStreamEntry[]>(() => {
		const rangeStartMs = rangeStart.getTime();
		const rangeEndMs = rangeEnd.getTime();
		const entries: ActivityStreamEntry[] = [];

		for (const session of claudeSessions) {
			const timestamp = toTimestamp(session.timestamp);
			if (!timestamp) continue;
			if (timestamp < rangeStartMs || timestamp > rangeEndMs) {
				continue;
			}

			const description = session.firstMessage
				? session.firstMessage.slice(0, 100) + (session.firstMessage.length > 100 ? "..." : "")
				: `${session.messageCount} messages`;

			entries.push(buildActivityEntry({
				id: `claude:session:${session.id}`,
				title: session.summary || "Claude Session",
				description,
				source: "claude",
				timestamp,
			}));
		}

		return entries;
	}, [claudeSessions, rangeStart, rangeEnd]);

	const activities = useMemo<ActivityStreamItem[]>(() => {
		const entries = [...calendarEntries, ...gitHubEntries, ...atlassianEntries, ...claudeEntries];
		entries.sort((a, b) => b.timestamp - a.timestamp);
		return entries.slice(0, MAX_ACTIVITY_ITEMS).map(({ timestamp, ...rest }) => rest);
	}, [calendarEntries, gitHubEntries, atlassianEntries, claudeEntries]);

	return {
		activities,
		isLoading: gitHubLoading || calendarLoading || activityLoading || claudeLoading,
		error: gitHubError || calendarError || activityError || claudeError,
		refresh,
	};
}
