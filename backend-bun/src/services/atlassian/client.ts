/**
 * Atlassian REST API client with retry logic
 */

export interface AtlassianAuth {
  baseUrl: string;
  email: string;
  apiToken: string;
}

function buildAuthHeader(email: string, apiToken: string): string {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${encoded}`;
}

export interface FetchOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  timeout?: number;
  maxRetries?: number;
}

export async function atlassianFetch<T = unknown>(
  auth: AtlassianAuth,
  path: string,
  options: FetchOptions = {}
): Promise<T | null> {
  const { method = "GET", body, timeout = 20000, maxRetries = 2 } = options;

  const url = `${auth.baseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(auth.email, auth.apiToken),
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get("Retry-After") ?? "1");
        await Bun.sleep(retryAfter * 1000);
        continue;
      }

      if (response.status >= 500) {
        // Server error - exponential backoff
        const waitMs = 500 * (attempt + 1);
        await Bun.sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Atlassian API error ${response.status}: ${errorText}`);
      }

      // Handle empty response
      const text = await response.text();
      if (!text) return null;

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error("Request timeout");
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < maxRetries) {
        const waitMs = 500 * (attempt + 1);
        await Bun.sleep(waitMs);
      }
    }
  }

  throw lastError ?? new Error("Unknown error");
}
