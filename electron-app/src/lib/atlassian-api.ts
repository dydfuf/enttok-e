export type AtlassianService = "jira" | "confluence";

export type AtlassianAccount = {
	account_id: string;
	service: AtlassianService;
	org: string;
	base_url: string;
	email: string;
	created_at: string;
	updated_at: string;
	last_sync_at?: string | null;
};

export type AtlassianAccountCreate = {
	org: string;
	email: string;
	api_token: string;
};

export type AtlassianAccountsResponse = {
	accounts: AtlassianAccount[];
};

export type AtlassianSyncResponse = {
	job_id: string;
	status: string;
};

export type JiraDebugRequestInfo = {
	url: string;
	method: string;
	params?: Record<string, string>;
	body?: Record<string, unknown>;
};

export type JiraDebugResponseInfo = {
	status: number;
	ok: boolean;
	body?: unknown;
	error?: string;
};

export type JiraDebugAttempt = {
	request: JiraDebugRequestInfo;
	response: JiraDebugResponseInfo;
};

export type JiraDebugResponse = {
	account_id: string;
	primary: JiraDebugAttempt;
	fallback?: JiraDebugAttempt | null;
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

async function readErrorDetail(res: Response): Promise<string> {
	const text = await res.text();
	if (!text) {
		return `status ${res.status}`;
	}
	try {
		const data = JSON.parse(text) as { detail?: string };
		if (typeof data.detail === "string" && data.detail.trim().length > 0) {
			return data.detail;
		}
	} catch {
		// fallthrough to raw text
	}
	return text;
}

export async function fetchAtlassianAccounts(
	port: number,
	token: string,
	service: AtlassianService,
): Promise<AtlassianAccount[]> {
	const res = await fetch(buildApiUrl(port, `/${service}/accounts`), {
		method: "GET",
		headers: buildHeaders(token),
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch ${service} accounts: ${res.status}`);
	}
	const data: AtlassianAccountsResponse = await res.json();
	return data.accounts;
}

export async function createAtlassianAccount(
	port: number,
	token: string,
	service: AtlassianService,
	payload: AtlassianAccountCreate,
): Promise<AtlassianAccount> {
	const res = await fetch(buildApiUrl(port, `/${service}/accounts`), {
		method: "POST",
		headers: buildHeaders(token),
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const detail = await readErrorDetail(res);
		throw new Error(`Failed to create ${service} account: ${detail}`);
	}
	return res.json();
}

export async function deleteAtlassianAccount(
	port: number,
	token: string,
	service: AtlassianService,
	accountId: string,
): Promise<void> {
	const res = await fetch(
		buildApiUrl(port, `/${service}/accounts/${accountId}`),
		{
			method: "DELETE",
			headers: buildHeaders(token),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to delete ${service} account: ${res.status}`);
	}
}

export async function syncAtlassianAccount(
	port: number,
	token: string,
	service: AtlassianService,
	accountId: string,
): Promise<AtlassianSyncResponse> {
	const res = await fetch(
		buildApiUrl(port, `/${service}/accounts/${accountId}/sync`),
		{
			method: "POST",
			headers: buildHeaders(token),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to sync ${service} account: ${res.status}`);
	}
	return res.json();
}

export async function fetchJiraDebugSearch(
	port: number,
	token: string,
	accountId: string,
): Promise<JiraDebugResponse> {
	const res = await fetch(buildApiUrl(port, "/jira/dev/search"), {
		method: "POST",
		headers: buildHeaders(token),
		body: JSON.stringify({ account_id: accountId }),
	});
	if (!res.ok) {
		const detail = await readErrorDetail(res);
		throw new Error(`Failed to fetch Jira debug response: ${detail}`);
	}
	return res.json();
}
