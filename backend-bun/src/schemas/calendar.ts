import { z } from "zod";

// Calendar Provider
export type CalendarProvider = "google" | "apple";

// Request schemas
export const CalendarAccountCreateSchema = z.object({
  provider: z.union([z.literal("google"), z.literal("apple")]),
  display_name: z.string().optional(),
  email: z.string().optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type CalendarAccountCreateInput = z.infer<typeof CalendarAccountCreateSchema>;

export const CalendarSelectionUpdateSchema = z.object({
  selected: z.boolean(),
});

export type CalendarSelectionUpdateInput = z.infer<typeof CalendarSelectionUpdateSchema>;

export const OAuthCallbackRequestSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export type OAuthCallbackRequestInput = z.infer<typeof OAuthCallbackRequestSchema>;

// Response types
export interface CalendarAccount {
  account_id: string;
  provider: CalendarProvider;
  display_name: string | null;
  email: string | null;
  connected: boolean;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
}

export interface CalendarListItem {
  account_id: string;
  calendar_id: string;
  provider: string;
  name: string | null;
  description: string | null;
  is_primary: boolean;
  access_role: string | null;
  background_color: string | null;
  foreground_color: string | null;
  time_zone: string | null;
  selected: boolean;
}

export interface CalendarEvent {
  account_id: string;
  calendar_id: string;
  event_id: string;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  start_ts: number | null;
  end_ts: number | null;
  all_day: boolean;
  location: string | null;
  conference_url: string | null;
  visibility: string | null;
  status: string | null;
  organizer: Record<string, unknown> | null;
  attendees: Record<string, unknown>[] | null;
  html_link: string | null;
  time_zone: string | null;
  background_color: string | null;
  foreground_color: string | null;
}

export interface CalendarProviderInfo {
  id: CalendarProvider;
  label: string;
  auth_method: string;
  scopes: string[];
  notes: string;
}

export interface OAuthStartResponse {
  auth_url: string;
  state: string;
  redirect_uri: string;
  port: number;
}

export interface OAuthCompleteResponse {
  account: CalendarAccount | null;
  success: boolean;
  message: string;
}
