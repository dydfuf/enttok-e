export const ACTIVITY_SOURCES = [
	"calendar",
	"gmail",
	"jira",
	"confluence",
	"github",
	"slack",
	"claude",
	"unknown",
] as const;

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export type ActivityStreamItem = {
	id: string;
	title: string;
	description: string;
	source: ActivitySource;
	timeLabel: string;
	url?: string;
};

export type ActivityStreamEntry = ActivityStreamItem & {
	timestamp: number;
};

export function normalizeActivitySource(
	source?: string | null,
): ActivitySource {
	if (!source) return "unknown";
	const normalized = source.toLowerCase();
	return ACTIVITY_SOURCES.includes(normalized as ActivitySource)
		? (normalized as ActivitySource)
		: "unknown";
}
