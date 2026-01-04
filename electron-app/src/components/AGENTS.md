# COMPONENTS KNOWLEDGE BASE

## OVERVIEW

A design system built on 53 shadcn/ui primitives (Radix UI + Tailwind) with specialized feature modules for daily journaling, markdown editing, and workspace management.

## STRUCTURE

```
src/components/
├── ui/                 # 53 atomic shadcn/ui components (Radix UI + Tailwind)
├── activity/           # Real-time activity stream and event list items
├── calendar/           # Calendar event details and integration views
├── daily/              # Daily note orchestration, headers, and navigation
├── editor/             # CodeMirror 6 engine with custom Live Preview logic
├── layouts/            # Persistent app frame (Sidebar, NavBar, StatusBar)
├── sidebar/            # Specialized navigation and metadata filtering widgets
└── TitleBar.tsx        # Custom Electron window drag-region and controls
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Install new primitive | `pnpm dlx shadcn@latest add <component>` |
| Adjust layout structure | `src/components/layouts/AppLayout.tsx` |
| Customize editor logic | `src/components/editor/LivePreviewEditor.tsx` |
| Edit sidebar widgets | `src/components/sidebar/` |
| Modify primitive style | `src/components/ui/<component>.tsx` |
| Update activity feed | `src/components/activity/ActivityStream.tsx` |
| Fix daily note header | `src/components/daily/DailyHeader.tsx` |
| Add new UI animation | `src/lib/utils.ts` (cn) or component CSS |

## COMPONENT PATTERNS

### shadcn/ui Implementation
- **Primitives**: Files in `ui/` are generic building blocks. Avoid adding business logic here.
- **Tailwind & CN**: Always use the `cn()` utility for merging classes. Follow the `hsl(var(--variable))` pattern for colors to support theming.
- **Customization**: If a primitive requires heavy logic changes, move it out of `ui/` or wrap it in a feature-specific component.

### Feature-Based Organization
- **Encapsulation**: Components specific to a feature (e.g., `ActivityItem`) must reside within that feature's directory.
- **Index Exports**: Use `index.ts` files to provide a clean public API for each component folder, preventing deep import paths.
- **Layout Integrity**: Feature components should not define their own global positioning; they should respect the parent's layout constraints.

### Complexity Management (Hotspot Score: 14)
- **State Delegation**: Components should be "thin". Complex state management must be delegated to React Contexts or specialized Hooks in `src/hooks/`.
- **Composition over Inheritance**: Build complex views by nesting smaller, focused components rather than creating monolithic files.
- **Editor Architecture**: The `editor/` module isolates CodeMirror's imperative API from the rest of the declarative React tree.

## DEVELOPMENT GUIDELINES

1. **Atomic First**: Check if a task can be solved using existing `ui/` primitives before creating new custom components.
2. **Prop Consistency**: Use consistent naming for common props (e.g., `isOpen`, `onClose`, `isLoading`).
3. **Accessibility**: shadcn/ui provides Radix UI primitives with built-in A11y. Maintain this by following ARIA patterns when extending them.
4. **Performance**: Avoid anonymous functions in props to prevent unnecessary re-renders of the 50+ shadcn components in the tree.
