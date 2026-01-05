export type ActivityEvent = {
	id: string;
	source: string;
	event_type: string;
	title: string;
	description?: string | null;
	url?: string | null;
	actor?: string | null;
	event_time: string;
};

export type ActivityEventsResponse = {
	events: ActivityEvent[];
};

function buildApiUrl(port: number, path: string): string {
	return `http://127.0.0.1:${port}${path}`;
}

function buildHeaders(token: string): HeadersInit {
	return {
		"Content-Type": "application/json",
		"X-Backend-Token": token,
	};
}

export async function fetchActivityEvents(
	port: number,
	token: string,
	options: {
		start: string;
		end: string;
		sources?: string[];
		limit?: number;
	},
): Promise<ActivityEvent[]> {
	const params = new URLSearchParams();
	params.set("start", options.start);
	params.set("end", options.end);
	if (options.sources?.length) {
		params.set("sources", options.sources.join(","));
	}
	if (options.limit) {
		params.set("limit", String(options.limit));
	}

	const res = await fetch(
		buildApiUrl(port, `/activity/events?${params.toString()}`),
		{
			method: "GET",
			headers: buildHeaders(token),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch activity events: ${res.status}`);
	}
	const data: ActivityEventsResponse = await res.json();
	return data.events;
}
