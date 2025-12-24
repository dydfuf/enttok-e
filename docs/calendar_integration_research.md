# Calendar Integration Research

## Google Calendar
- **API**: Google Calendar REST API via Google Cloud project.
- **Auth**: OAuth 2.0 with installed/desktop app client ID for Electron; use PKCE or local loopback redirect. Store refresh tokens securely and request `https://www.googleapis.com/auth/calendar` scopes as needed (use read-only scopes when possible).
- **Key endpoints/workflows**:
  - List calendars: `GET /users/me/calendarList`
  - List events: `GET /calendars/{calendarId}/events`
  - Create/update events: `POST/PUT /calendars/{calendarId}/events`
  - Watch for changes: channel watch via `POST /calendars/{id}/events/watch` using webhooks; for desktop apps prefer incremental sync with `syncToken` and polling because receiving webhooks is harder without server.
- **Client libraries**: `googleapis` (Node) for REST and auth helpers; supports OAuth flow and token refresh.
- **Electron considerations**:
  - Perform OAuth via system browser and listen on local redirect URI (e.g., `http://127.0.0.1:<port>/oauth2callback`) or use PKCE with an embedded web view.
  - Persist tokens in the app’s secure storage (e.g., `keytar`).
  - Avoid embedding client secret in renderer code; keep in main process or backend.
- **Rate limits**: Default 1,000,000 queries/day and per-user QPS; use exponential backoff and `syncToken` to minimize calls.
- **Testing**: Use a test Google account and calendars; avoid production calendars when experimenting.

## Apple Calendar (CalDAV / iCloud)
- **API**: Apple does not expose a public REST API for Calendar; use CalDAV (standard protocol). For iCloud, users need an app-specific password.
- **Auth**: Basic auth with iCloud username (email) + app-specific password. For on-device Apple Calendar accounts, CalDAV service URL is typically `https://caldav.icloud.com` with user-specific principal discovered after initial request.
- **Client libraries**: CalDAV clients such as `dav` (npm package) or `node-caldav` for discovery, listing calendars, and event CRUD via iCalendar (`.ics`) data.
- **Key operations**:
  - Discover principal and calendar home via PROPFIND.
  - List calendars with `CALDAV:calendar` properties.
  - Create/update events via `PUT` of `.ics` to event URLs; delete with `DELETE`.
  - Sync using `REPORT` requests with sync tokens (`DAV:sync-token`) to fetch changes incrementally.
- **Electron considerations**:
  - Collect server URL, Apple ID email, and app-specific password from user; store securely.
  - CalDAV traffic is HTTPS; validate TLS.
  - Support time zone handling via `VTIMEZONE` components in iCalendar data.
- **Limitations**: No push webhooks; rely on periodic sync and sync tokens. App-specific passwords can be revoked by the user.

## UX and Permission Considerations
- Clearly request consent for calendar access and outline scope (read-only vs read/write).
- Provide per-calendar selection and sync frequency controls.
- Allow disconnecting accounts and wiping cached tokens/credentials.

## Security/Storage Suggestions
- Store OAuth tokens or app-specific passwords in OS keychain (`keytar`).
- Encrypt cached event data at rest if stored locally.
- Keep secrets out of renderer; use IPC between renderer and main/backend for token operations.

## Minimal Implementation Outline
1. **Google**: Implement OAuth (PKCE/local loopback), fetch calendars/events with `googleapis`, and poll using `syncToken`. Provide UI for connect/disconnect and scope selection.
2. **Apple**: Build CalDAV client flow: collect credentials, discover calendars, sync via `REPORT` with sync token, and perform CRUD through `.ics` payloads. Poll periodically since push isn’t available.
3. Unify event model internally to map Google Calendar fields and iCalendar properties to app domain objects.
