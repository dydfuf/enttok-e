# ELECTRON-APP KNOWLEDGE BASE

## OVERVIEW

React 19 frontend with Electron wrapper. TanStack Router for navigation, shadcn/ui components.

## STRUCTURE

```
electron-app/
├── electron/              # Main process
│   ├── main.ts           # App entry, window lifecycle
│   ├── preload.ts        # contextBridge API exposure
│   └── main/             # Modular handlers
│       ├── ipc.ts        # All ipcMain.handle registrations
│       ├── backend.ts    # Python subprocess management
│       ├── window.ts     # BrowserWindow creation
│       └── runtime.ts    # uv/python dependency checks
├── src/
│   ├── routes/           # TanStack Router (file-based)
│   │   ├── __root.tsx    # Root layout, context providers
│   │   ├── _app.tsx      # App layout with sidebar
│   │   └── _app/         # App pages (daily, calendar, settings)
│   ├── components/
│   │   ├── ui/           # shadcn/ui (53 components)
│   │   ├── daily/        # Daily note components
│   │   ├── editor/       # CodeMirror editor
│   │   ├── calendar/     # Calendar views
│   │   └── layouts/      # AppLayout, AppSidebar
│   ├── contexts/         # React contexts
│   ├── hooks/            # Custom hooks
│   └── lib/              # Utilities
└── public/               # Static assets
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add route | `src/routes/_app/` (creates nav entry) |
| Add shadcn component | `pnpm dlx shadcn@latest add <name>` |
| Add custom hook | `src/hooks/` |
| Modify editor | `src/components/editor/` |
| Add IPC method | `electron/preload.ts` + `electron/main/ipc.ts` |

## ROUTING CONVENTIONS

TanStack Router file-based routing:
- `_app.tsx` = Layout route (renders `<Outlet />`)
- `_app/daily.tsx` = `/daily` route
- `_app/daily.$date.tsx` = `/daily/:date` dynamic route
- `_app/daily.index.tsx` = `/daily` index

Route tree auto-generated: `src/routeTree.gen.ts` (never edit manually)

## IPC PATTERN

```typescript
// 1. preload.ts - expose to renderer
const api: ElectronAPI = {
  myMethod: (arg: string) => ipcRenderer.invoke("my:channel", arg),
};

// 2. main/ipc.ts - handle in main
ipcMain.handle("my:channel", (_, arg: string) => doSomething(arg));

// 3. renderer - use via hook or context
const api = getElectronAPI();
await api.myMethod("value");
```

## CONTEXTS

| Context | Hook | Purpose |
|---------|------|---------|
| BackendContext | `useBackend()` | Backend state, start/stop |
| VaultContext | `useVault()` | Current vault, notes |
| GitHubContext | `useGitHub()` | GitHub integration |
| SidebarControlsContext | `useSidebarControls()` | UI state |

## CONVENTIONS

- Components in PascalCase directories (`DailyNotePage.tsx`)
- Hooks prefixed with `use` (`useAutoSave.ts`)
- shadcn components untouched in `ui/`
- Custom components outside `ui/`

## ANTI-PATTERNS

- Never import from `electron` in renderer (use preload bridge)
- Never edit `routeTree.gen.ts`
- Never put business logic in components (use hooks/services)
- Never use relative imports across `src/` (use `@/` alias)

## BUILD

```bash
pnpm dev                 # Vite dev + Electron (waits for :5173)
pnpm build               # tsc + vite build
pnpm build:electron      # Electron TypeScript only
pnpm package             # electron-builder distribution
```
