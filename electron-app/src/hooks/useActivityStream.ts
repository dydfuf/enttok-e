import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, isValid, parseISO, subHours } from "date-fns";
import { useGitHub } from "@/contexts/GitHubContext";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import type { CalendarEvent } from "@/lib/calendar-api";
import type { ActivityItemData } from "@/components/activity";

const ACTIVITY_WINDOW_HOURS = 24;
const MAX_ACTIVITY_ITEMS = 50;

type ActivityEntry = ActivityItemData & { timestamp: number };

type ActivityStreamState = {
	activities: ActivityItemData[];
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

export function useActivityStream(): ActivityStreamState {
	const {
		status,
		summary,
		loading: gitHubLoading,
		error: gitHubError,
		refresh: refreshGitHub,
		refreshSummary,
	} = useGitHub();

	const [rangeEnd, setRangeEnd] = useState(() => new Date());
	const rangeStart = useMemo(
		() => subHours(rangeEnd, ACTIVITY_WINDOW_HOURS),
		[rangeEnd],
	);

	const {
		events,
		isLoading: calendarLoading,
		error: calendarError,
		reload: reloadCalendar,
	} = useCalendarEvents({
		start: rangeStart,
		end: rangeEnd,
		selectedOnly: true,
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
		if (status?.cli.found && status.auth.authenticated && !summary) {
			refreshSummary();
		}
	}, [status?.cli.found, status?.auth.authenticated, summary, refreshSummary]);

	const refresh = useCallback(async () => {
		setRangeEnd(new Date());
		await Promise.allSettled([
			refreshGitHub(),
			refreshSummary(),
			reloadCalendar(),
			reloadActivity(),
		]);
	}, [refreshGitHub, refreshSummary, reloadActivity, reloadCalendar]);

	const calendarEntries = useMemo<ActivityEntry[]>(() => {
		return events
			.map((event) => {
				const timestamp = toTimestamp(event.start_time);
				if (!timestamp) return null;

				return {
					id: `calendar:${event.calendar_id}:${event.event_id}`,
					title: event.title || "Untitled event",
					description: formatCalendarDetails(event),
					source: "calendar",
					sourceLabel: "Calendar",
					time: formatRelativeTime(timestamp),
					timestamp,
				};
			})
			.filter((entry): entry is ActivityEntry => Boolean(entry));
	}, [events]);

	const gitHubEntries = useMemo<ActivityEntry[]>(() => {
		if (!summary) return [];

		const entries: ActivityEntry[] = [];
		const seen = new Set<string>();
		const rangeStartMs = rangeStart.getTime();
		const rangeEndMs = rangeEnd.getTime();

		const pushEntry = (entry: ActivityEntry) => {
			if (entry.timestamp < rangeStartMs || entry.timestamp > rangeEndMs) {
				return;
			}
			if (seen.has(entry.id)) return;
			seen.add(entry.id);
			entries.push(entry);
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
				sourceLabel: "GitHub",
				time: formatRelativeTime(timestamp),
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
				sourceLabel: "GitHub",
				time: formatRelativeTime(timestamp),
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
				sourceLabel: "GitHub",
				time: formatRelativeTime(timestamp),
				timestamp,
			});
		}

		return entries;
	}, [summary, rangeEnd, rangeStart]);

	const atlassianEntries = useMemo<ActivityEntry[]>(() => {
		const sourceLabels: Record<string, string> = {
			jira: "Jira",
			confluence: "Confluence",
		};

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

				return {
					id: `atlassian:${event.source}:${event.id}`,
					title: event.title,
					description,
					source: event.source as ActivityItemData["source"],
					sourceLabel: sourceLabels[event.source] || "Atlassian",
					time: formatRelativeTime(timestamp),
					timestamp,
				};
			})
			.filter((entry): entry is ActivityEntry => Boolean(entry));
	}, [activityEvents]);

	const activities = useMemo<ActivityItemData[]>(() => {
		const entries = [...calendarEntries, ...gitHubEntries, ...atlassianEntries];
		entries.sort((a, b) => b.timestamp - a.timestamp);
		return entries.slice(0, MAX_ACTIVITY_ITEMS).map(({ timestamp, ...rest }) => rest);
	}, [calendarEntries, gitHubEntries, atlassianEntries]);

	return {
		activities,
		isLoading: gitHubLoading || calendarLoading || activityLoading,
		error: gitHubError || calendarError || activityError,
		refresh,
	};
}
