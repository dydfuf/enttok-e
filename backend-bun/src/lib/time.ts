const OFFSET_NO_COLON = /([+-])(\d{2})(\d{2})$/;

/**
 * Get current UTC time in ISO format
 */
export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Parse ISO date string to Unix epoch (seconds)
 */
export function parseIsoToEpoch(value: string): number {
  let normalized = value.endsWith("Z") ? value.replace("Z", "+00:00") : value;

  // Handle timezone offset without colon (e.g., +0900 -> +09:00)
  if (OFFSET_NO_COLON.test(normalized)) {
    normalized = normalized.replace(OFFSET_NO_COLON, "$1$2:$3");
  }

  // Handle date-only format (YYYY-MM-DD)
  if (normalized.length === 10) {
    normalized = `${normalized}T00:00:00+00:00`;
  }

  const date = new Date(normalized);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Generate a unique ID with prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
