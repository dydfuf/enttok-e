import { config } from "../../lib/config.ts";

// PKCE helpers
function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// State management
interface OAuthState {
  code_verifier: string;
  port: number;
  redirect_uri: string;
  created_at: number;
}

const pendingOAuthStates = new Map<string, OAuthState>();

// Clean up expired states (older than 10 minutes)
function cleanupExpiredStates(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [state, data] of pendingOAuthStates) {
    if (now - data.created_at > maxAge) {
      pendingOAuthStates.delete(state);
    }
  }
}

export async function startGoogleOAuth(): Promise<{
  auth_url: string;
  state: string;
  redirect_uri: string;
  port: number;
}> {
  cleanupExpiredStates();

  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }

  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const port = config.BACKEND_PORT;
  const redirectUri = `http://127.0.0.1:${port}/calendar/oauth/google/callback`;

  pendingOAuthStates.set(state, {
    code_verifier: codeVerifier,
    port,
    redirect_uri: redirectUri,
    created_at: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return {
    auth_url: authUrl,
    state,
    redirect_uri: redirectUri,
    port,
  };
}

export function getOAuthState(state: string): OAuthState | undefined {
  const data = pendingOAuthStates.get(state);
  if (data) {
    pendingOAuthStates.delete(state);
  }
  return data;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: expiresAt,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  expires_at: string;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_at: expiresAt,
  };
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  const data = (await response.json()) as { email: string };
  return data.email;
}
