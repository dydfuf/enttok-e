# ROUTES KNOWLEDGE BASE

## OVERVIEW
TanStack Router file-based routing system managing app navigation, layout inheritance, and vault-access guards.

## ROUTING CONVENTIONS
- **File-based Routing**: The filesystem structure determines the route tree (e.g., `_app/settings.tsx` maps to `/settings`).
- **Layout Routes**: Files prefixed with `_` (e.g., `_app.tsx`) define shared layouts for their sibling directories without adding to the URL path.
- **Dynamic Segments**: Use the `$` prefix for URL parameters (e.g., `$date.tsx` captures segments like `/daily/2026-01-03`).
- **Index Routes**: `index.tsx` serves as the default route for a directory segment (e.g., `_app/daily.index.tsx`).
- **Route Guards**: Component-level guards (like `VaultGuard` in `_app.tsx`) enforce application state requirements before rendering.
- **Auto-Generation**: The route tree is maintained in `src/routeTree.gen.ts`; this file should never be modified manually.
- **Navigation**: Use the `useNavigate` hook for programmatic navigation or the `<Link />` component for declarative links.

## WHERE TO LOOK
- **Global Entry**: `__root.tsx` (Contains global Context Providers, TitleBar, and TanStack DevTools).
- **Vault Landing**: `index.tsx` (Root path `/`; handles vault selection, recent vaults, and initial setup).
- **App Layout**: `_app.tsx` (The primary layout wrapper for authenticated views; enforces vault initialization).
- **Daily Journal**: `_app/daily.tsx` and `_app/daily.index.tsx` (The main workflow interface for daily notes).
- **Dynamic Daily**: `_app/daily.$date.tsx` (Displays notes for specific historical dates).
- **Note Management**: `_app/notes/` (Handles individual note viewing and editing via `$noteId.tsx`).
- **Search & Discovery**: `_app/search.tsx` and the `_app/tags/` directory for filtered content views.
- **Integrations**: `_app/integrations.tsx` and sub-routes (Configuration for GitHub, Google Calendar, etc.).

## IMPLEMENTATION PATTERNS

### Vault Access Guard (`_app.tsx`)
Acts as a gatekeeper to ensure a vault is selected before allowing access to internal application routes.
```typescript
export const Route = createFileRoute("/_app")({
  component: VaultGuard,
});

function VaultGuard() {
  const { vaultPath, isInitialized } = useVault();
  const navigate = useNavigate();

  useEffect(() => {
    if (isInitialized && !vaultPath) {
      navigate({ to: "/" });
    }
  }, [isInitialized, vaultPath, navigate]);

  return vaultPath ? <AppLayout /> : <LoadingScreen />;
}
```

### Dynamic Parameter Access
URL parameters are accessed via the `Route.useParams()` hook, which is type-safe based on the route definition.
```typescript
// From src/routes/_app/notes/$noteId.tsx
export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NoteDetail,
});

function NoteDetail() {
  const { noteId } = Route.useParams();
  // noteId is typed as string based on the file name
}
```

### Hierarchical Layouts
The `_app` prefix allows `_app.tsx` to wrap all files within the `_app/` directory. This pattern is used to provide the `AppLayout` (Sidebar, NavBar, StatusBar) to all functional pages while excluding it from the `index.tsx` (Vault Selection) landing page.
