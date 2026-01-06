export type CalendarProvider = "google" | "apple";

export type CalendarProviderInfo = {
	id: CalendarProvider;
	label: string;
	auth_method: string;
	scopes: string[];
	notes?: string;
};

export type CalendarAccount = {
	account_id: string;
	provider: CalendarProvider;
	display_name?: string;
	email?: string;
	connected: boolean;
	created_at: string;
	updated_at: string;
	last_sync_at?: string;
	sync_cursor?: string;
};

export type CalendarAccountCreate = {
	provider: CalendarProvider;
	display_name?: string;
	email?: string;
	credentials?: Record<string, unknown>;
	config?: Record<string, unknown>;
};

export type ProvidersResponse = {
	providers: CalendarProviderInfo[];
};

export type AccountsResponse = {
	accounts: CalendarAccount[];
};

export type CalendarListItem = {
	account_id: string;
	calendar_id: string;
	provider: CalendarProvider;
	name: string;
	description?: string;
	is_primary: boolean;
	access_role?: string;
	background_color?: string;
	foreground_color?: string;
	time_zone?: string;
	selected: boolean;
	created_at?: string;
	updated_at?: string;
};

export type CalendarsResponse = {
	calendars: CalendarListItem[];
};

export type CalendarEvent = {
	account_id: string;
	event_id: string;
	calendar_id: string;
	title: string;
	description?: string;
	start_time: string;
	end_time: string;
	start_ts: number;
	end_ts: number;
	all_day: boolean;
	location?: string;
	conference_url?: string;
	visibility?: string;
	status: string;
	organizer?: { email?: string; displayName?: string };
	attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
	html_link?: string;
	time_zone?: string;
	created_at?: string;
	updated_at?: string;
	calendar_color?: string;
	calendar_name?: string;
};

export type EventsResponse = {
	events: CalendarEvent[];
};

export type CalendarSelectionUpdate = {
	selected: boolean;
};

export type SyncResponse = {
	job_id: string;
	status: string;
};

// OAuth Types
export type OAuthStartResponse = {
	auth_url: string;
	state: string;
	redirect_uri: string;
	port: number;
};

export type OAuthCompleteResponse = {
	account: CalendarAccount;
	success: boolean;
	message: string;
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

export async function fetchProviders(
	port: number,
	token: string,
): Promise<CalendarProviderInfo[]> {
	const res = await fetch(buildApiUrl(port, "/calendar/providers"), {
		method: "GET",
		headers: buildHeaders(token),
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch providers: ${res.status}`);
	}
	const data: ProvidersResponse = await res.json();
	return data.providers;
}

export async function fetchAccounts(
	port: number,
	token: string,
): Promise<CalendarAccount[]> {
	const res = await fetch(buildApiUrl(port, "/calendar/accounts"), {
		method: "GET",
		headers: buildHeaders(token),
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch accounts: ${res.status}`);
	}
	const data: AccountsResponse = await res.json();
	return data.accounts;
}

export async function fetchCalendars(
	port: number,
	token: string,
	options: {
		account_id?: string;
		selected_only?: boolean;
	} = {},
): Promise<CalendarListItem[]> {
	const params = new URLSearchParams();
	if (options.account_id) {
		params.set("account_id", options.account_id);
	}
	if (options.selected_only !== undefined) {
		params.set("selected_only", String(options.selected_only));
	}

	const query = params.toString();
	const res = await fetch(
		buildApiUrl(port, `/calendar/calendars${query ? `?${query}` : ""}`),
		{
			method: "GET",
			headers: buildHeaders(token),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch calendars: ${res.status}`);
	}
	const data: CalendarsResponse = await res.json();
	return data.calendars;
}

export async function fetchEvents(
	port: number,
	token: string,
	options: {
		start: string;
		end: string;
		account_id?: string;
		calendar_ids?: string[];
		selected_only?: boolean;
	},
): Promise<CalendarEvent[]> {
	const params = new URLSearchParams();
	params.set("start", options.start);
	params.set("end", options.end);
	if (options.account_id) {
		params.set("account_id", options.account_id);
	}
	if (options.calendar_ids?.length) {
		params.set("calendar_ids", options.calendar_ids.join(","));
	}
	if (options.selected_only !== undefined) {
		params.set("selected_only", String(options.selected_only));
	}

	const res = await fetch(
		buildApiUrl(port, `/calendar/events?${params.toString()}`),
		{
			method: "GET",
			headers: buildHeaders(token),
		},
	);
	if (!res.ok) {
		let errorDetail = `HTTP ${res.status}`;
		try {
			const errorData = await res.json();
			if (errorData.detail) {
				errorDetail = errorData.detail;
			}
		} catch {
			// ignore JSON parse errors
		}
		throw new Error(`Failed to fetch events: ${errorDetail}`);
	}
	const data: EventsResponse = await res.json();
	return data.events;
}

export async function updateCalendarSelection(
	port: number,
	token: string,
	accountId: string,
	calendarId: string,
	selected: boolean,
): Promise<void> {
	const payload: CalendarSelectionUpdate = { selected };
	const res = await fetch(
		buildApiUrl(port, `/calendar/calendars/${accountId}/${calendarId}`),
		{
			method: "PATCH",
			headers: buildHeaders(token),
			body: JSON.stringify(payload),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to update calendar selection: ${res.status}`);
	}
}

export async function createAccount(
	port: number,
	token: string,
	payload: CalendarAccountCreate,
): Promise<CalendarAccount> {
	const res = await fetch(buildApiUrl(port, "/calendar/accounts"), {
		method: "POST",
		headers: buildHeaders(token),
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		throw new Error(`Failed to create account: ${res.status}`);
	}
	return res.json();
}

export async function deleteAccount(
	port: number,
	token: string,
	accountId: string,
): Promise<void> {
	const res = await fetch(
		buildApiUrl(port, `/calendar/accounts/${accountId}`),
		{
			method: "DELETE",
			headers: buildHeaders(token),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to delete account: ${res.status}`);
	}
}

export async function syncAccount(
	port: number,
	token: string,
	accountId: string,
	payload: Record<string, unknown> = {},
): Promise<SyncResponse> {
	const res = await fetch(
		buildApiUrl(port, `/calendar/accounts/${accountId}/sync`),
		{
			method: "POST",
			headers: buildHeaders(token),
			body: JSON.stringify(payload),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to sync account: ${res.status}`);
	}
	return res.json();
}

// =============================================================================
// Google OAuth Functions
// =============================================================================

export async function startGoogleOAuth(
	port: number,
	token: string,
): Promise<OAuthStartResponse> {
	const res = await fetch(buildApiUrl(port, "/calendar/oauth/google/start"), {
		method: "POST",
		headers: buildHeaders(token),
	});
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to start OAuth: ${res.status} - ${errorText}`);
	}
	return res.json();
}

export async function completeGoogleOAuth(
	port: number,
	token: string,
	code: string,
	state: string,
): Promise<OAuthCompleteResponse> {
	const res = await fetch(
		buildApiUrl(port, "/calendar/oauth/google/complete"),
		{
			method: "POST",
			headers: buildHeaders(token),
			body: JSON.stringify({ code, state }),
		},
	);
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to complete OAuth: ${res.status} - ${errorText}`);
	}
	return res.json();
}
