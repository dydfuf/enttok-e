import {
	Activity,
	Bot,
	Bug,
	Calendar,
	Code,
	FileText,
	Mail,
	MessageSquare,
	type LucideIcon,
} from "lucide-react";
import type { ActivitySource } from "@/lib/activity-types";

type ActivitySourceConfig = {
	label: string;
	icon: LucideIcon;
	iconClassName: string;
	dotClassName: string;
	badgeClassName: string;
};

const activitySourceConfig: Record<ActivitySource, ActivitySourceConfig> = {
	calendar: {
		label: "Calendar",
		icon: Calendar,
		iconClassName: "text-orange-500",
		dotClassName: "bg-orange-500",
		badgeClassName:
			"border-orange-200 text-orange-600 dark:border-orange-500/40 dark:text-orange-400",
	},
	gmail: {
		label: "Gmail",
		icon: Mail,
		iconClassName: "text-red-500",
		dotClassName: "bg-red-500",
		badgeClassName:
			"border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-400",
	},
	jira: {
		label: "Jira",
		icon: Bug,
		iconClassName: "text-blue-500",
		dotClassName: "bg-blue-500",
		badgeClassName:
			"border-blue-200 text-blue-600 dark:border-blue-500/40 dark:text-blue-400",
	},
	confluence: {
		label: "Confluence",
		icon: FileText,
		iconClassName: "text-sky-500",
		dotClassName: "bg-sky-500",
		badgeClassName:
			"border-sky-200 text-sky-600 dark:border-sky-500/40 dark:text-sky-400",
	},
	github: {
		label: "GitHub",
		icon: Code,
		iconClassName: "text-foreground",
		dotClassName: "bg-foreground",
		badgeClassName: "border-border text-foreground",
	},
	slack: {
		label: "Slack",
		icon: MessageSquare,
		iconClassName: "text-violet-500",
		dotClassName: "bg-violet-500",
		badgeClassName:
			"border-violet-200 text-violet-600 dark:border-violet-500/40 dark:text-violet-400",
	},
	claude: {
		label: "Claude Code",
		icon: Bot,
		iconClassName: "text-orange-500",
		dotClassName: "bg-orange-500",
		badgeClassName:
			"border-orange-200 text-orange-600 dark:border-orange-500/40 dark:text-orange-400",
	},
	unknown: {
		label: "Other",
		icon: Activity,
		iconClassName: "text-muted-foreground",
		dotClassName: "bg-foreground/40",
		badgeClassName: "border-border text-muted-foreground",
	},
};

export function getActivitySourceConfig(
	source: ActivitySource,
): ActivitySourceConfig {
	return activitySourceConfig[source] ?? activitySourceConfig.unknown;
}

export function getActivitySourceLabel(source: ActivitySource): string {
	return getActivitySourceConfig(source).label;
}
