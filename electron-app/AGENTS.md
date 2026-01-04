# ELECTRON-APP KNOWLEDGE BASE

## OVERVIEW
React 19 frontend with Electron wrapper, utilizing TanStack Router for navigation and shadcn/ui for accessible components.

## STRUCTURE
```
electron-app/
├── electron/              # Main process (Node.js/TypeScript)
│   ├── main.ts            # Entry point, window management, lifecycle
│   ├── preload.ts         # contextBridge: Securely exposing IPC to renderer
│   ├── paths.ts           # App-wide path constants (logs, cache, userData)
│   ├── store.ts           # Persistence using electron-store
│   └── main/              # Modularized domain logic for Main process
│       ├── ipc.ts         # Central registry for all ipcMain.handle
│       ├── backend.ts     # Python subprocess management (uv/python)
│       ├── github.ts      # GitHub CLI integration logic
│       ├── runtime.ts     # System-level dependency & health checks
│       └── window.ts      # BrowserWindow configuration and creation
├── src/                   # Renderer process (React 19)
│   ├── routes/            # TanStack Router: File-based routing logic
│   ├── components/        # UI Layer
│   │   ├── ui/            # shadcn/ui components (atomic UI)
│   │   ├── activity/      # GitHub/Activity stream components
│   │   ├── daily/         # Journaling & Daily note features
│   │   ├── editor/        # CodeMirror 6 markdown editor implementation
│   │   └── layouts/       # Persistent UI shells (Sidebar, Navbar)
│   ├── hooks/             # Domain-specific logic (useDailyNotes, useFileSystem)
│   ├── contexts/          # Global state (Vault, Backend, GitHub, UI)
│   ├── lib/               # Utilities, API clients, and constants
│   └── shared/            # Type definitions shared between Main and Renderer
└── public/                # Static assets, fonts, and icons
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add New Page | `src/routes/_app/` (Check `routeTree.gen.ts` for updates) |
| Add IPC Method | `src/shared/electron-api.ts` -> `preload.ts` -> `main/ipc.ts` |
| Style Changes | `src/styles.css` (Tailwind) or `src/components/ui/` |
| Backend Logic | `electron/main/backend.ts` & `src/contexts/BackendContext.tsx` |
| File Operations | `src/hooks/useFileSystem.ts` & `electron/file-handlers.ts` |

## ROUTING CONVENTIONS
The app uses **TanStack Router** for type-safe, file-based routing.
- **Layouts**: `_app.tsx` wraps all authenticated views with the sidebar.
- **Index Routes**: `_app/daily.index.tsx` handles the default view for a directory.
- **Dynamic Routes**: `_app/daily.$date.tsx` uses `$date` as a param accessible via `useParams()`.
- **Note**: The router generates code in `src/routeTree.gen.ts`. Do not touch this file. If routes aren't updating, ensure the dev server is running.

## IPC PATTERN
Strict "Bridge" pattern for security and type safety.
1. **Type Definition**: Define the interface in `src/shared/electron-api.ts`.
2. **Preload**: Expose methods via `contextBridge.exposeInMainWorld("electronAPI", ...)`.
3. **Main Registration**: Map channels in `electron/main/ipc.ts` to service functions.
4. **Naming**: Use `prefix:action` (e.g., `vault:list-notes`, `github:status`).
5. **Renderer Usage**: Access via `window.electronAPI` (preferably wrapped in a hook).

## CONTEXTS & STATE
- **VaultContext**: Manages the current workspace path, note indexing, and recent vaults.
- **BackendContext**: Tracks the Python server status (stopped, starting, running) and handles logs.
- **GitHubContext**: Orchestrates GitHub CLI interactions to provide activity feeds.
- **SidebarControlsContext**: Manages UI states like collapsed sections and active filters.

## CONVENTIONS
- **Path Aliases**: Always use `@/` for internal imports to avoid deep relative paths.
- **Hook-First**: Wrap complex IPC or context logic in custom hooks (e.g., `useNotes`).
- **Strict Typing**: Every IPC call should have a defined Request/Response type in `shared/`.
- **Component Structure**: Keep domain components (Daily, Editor) separate from generic UI.

## ANTI-PATTERNS
- **Node in Renderer**: Never use `fs`, `path`, or `child_process` directly in `src/`.
- **Direct IPC**: Avoid using `window.electronAPI` directly in components; use a hook.
- **Prop Drilling**: Use `contexts/` for global app state (Vault, User settings).
- **Manual Routing**: Don't try to manually link routes; use the `<Link />` component.

## BUILD & LIFECYCLE
- `pnpm dev`: Runs Vite (renderer) and Electron (main) concurrently.
- `pnpm package`: Uses `electron-builder` to package the app for the current OS.
- **Logs**: Electron logs are stored in standard OS locations, accessible via `electron/paths.ts`.

