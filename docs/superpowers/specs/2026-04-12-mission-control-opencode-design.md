# Mission Control — OpenCode Fork Design

**Date:** 2026-04-12  
**Status:** Approved  
**Approach:** Option A — new `/mission-control` route integrated into the OpenCode fork frontend

---

## 1. Overview

Mission Control is a dashboard added to the OpenCode fork that gives the user a macro view of all active AI agents across all projects. The goal is to allow a supervisor role: review what every agent is doing, check their progress, spot errors, and navigate directly to a specific session when action is needed.

This is built as a new route inside the existing SolidJS frontend (`packages/app`). It requires no new backend and no changes to the OpenCode core — only additions. All API endpoints used (`/session/:id/message`, `/session/:id/todo`, `/session/:id/diff`) already exist in the OpenCode HTTP API.

---

## 2. Architecture

### Stack

- **Framework:** SolidJS (existing, no change)
- **Router:** `@solidjs/router` — one new route added
- **State:** Existing reactive contexts (`useGlobalSync`, `useGlobalSDK`) — no new store
- **Data:** OpenCode local HTTP API via `@opencode-ai/sdk` — no new backend

### New files

```
packages/app/src/
  pages/
    mission-control/
      index.tsx              ← page root, layout, stats bar, metrics bar
      components/
        project-card.tsx     ← card per project with agent rows
        agent-row.tsx        ← one row per session with status badge
        todo-list.tsx        ← top-3 todos for a session
        diff-preview.tsx     ← count of changed files (no inline diff)
        metrics-bar.tsx      ← token/cost aggregation for busy sessions
  app.tsx                    ← +1 route: /mission-control
  pages/layout/
    sidebar-shell.tsx        ← +1 navigation icon
  primitives/
    create-visible.ts        ← IntersectionObserver primitive (new)
```

### Modified files

| File | Change |
|------|--------|
| `packages/app/src/app.tsx` | Add `<Route path="/mission-control" component={MissionControlPage} />` |
| `packages/app/src/pages/layout/sidebar-shell.tsx` | Add grid/dashboard icon linking to `/mission-control` |

### Data flow

```
SSE /global/event
      ↓
useGlobalSync()  →  Project[]  +  Record<sessionId, SessionStatus>
      ↓
MissionControlPage
  ├─ StatsBar          (reactive counts, no extra requests)
  ├─ MetricsBar        (GET /session/:id/message for busy sessions only)
  └─ ProjectCard[]     (one per project)
       └─ AgentRow[]   (one per session in that project)
            ├─ TodoList     (GET /session/:id/todo — lazy, on visible)
            └─ DiffPreview  (GET /session/:id/diff — lazy, on visible)
```

---

## 3. UI Layout

```
┌──────────────────────────────────────────────────────┐
│  Mission Control                                     │
├──────────────────────────────────────────────────────┤
│  STATS BAR                                           │
│  ● 3 activas  ○ 5 idle  ⚠ 1 retry                  │
│  ──────────────────────────────────────────────────  │
│  Sesiones activas: 12.4k tokens · $0.08              │
│  (aviso si proveedor no reporta costo)               │
├──────────────────────────────────────────────────────┤
│  GRID DE PROYECTOS                                   │
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │ ProjectCard     │  │ ProjectCard     │           │
│  │ /path/to/proj   │  │ /path/to/proj2  │           │
│  │                 │  │                 │           │
│  │ [session-1] ●   │  │ sin actividad   │           │
│  │  ✓ task done    │  │                 │           │
│  │  → task in prog │  │                 │           │
│  │  ○ task pending │  │                 │           │
│  │ [Ver sesión]    │  │                 │           │
│  └─────────────────┘  └─────────────────┘           │
└──────────────────────────────────────────────────────┘
```

---

## 4. Components

### `MissionControlPage` (`index.tsx`)

- Top-level page component
- Reads `projects` and `sessionStatus` from `useGlobalSync()`
- Renders `StatsBar` + `MetricsBar` + `ProjectCard` grid
- Projects sorted: those with `retry` sessions first, then `busy`, then `idle`

### `StatsBar`

- Reactive counts derived from `sessionStatus` map (a `Record<sessionId, SessionStatus>` exposed by `useGlobalSync()`). `SessionStatus` values are `"busy"`, `"idle"`, or `"retry"` as defined in the OpenCode SDK `SessionStatus` type.
- Updates automatically via SSE — no polling
- `retry` count highlighted in red/amber

### `MetricsBar`

- On mount, fetches `GET /session/:id/message` for all currently `busy` sessions and sums `tokens.input + tokens.output` and `cost` across all messages
- When a new session transitions to `busy` via SSE, its messages are fetched and added to the running totals reactively
- If all `cost` values are `0`, shows "Cost not available for this provider" instead of a dollar total
- Does not fetch historical / idle sessions

### `ProjectCard` (`project-card.tsx`)

- Displays project name and path
- Lists all sessions for that project via `AgentRow`
- If no sessions exist, shows a neutral "no active agents" state
- Clicking the project name navigates to `/:dir`

### `AgentRow` (`agent-row.tsx`)

- One row per session
- Shows session `title` field (falls back to session `id` if `title` is an empty string or absent) and a status badge:
  - `busy` → green pulsing dot
  - `idle` → grey dot
  - `retry` → red dot, card gets a red left border
- Renders `TodoList` and `DiffPreview` (lazy)
- "Ver sesión" button navigates to `/:dir/session/:id`

### `TodoList` (`todo-list.tsx`)

- Renders top-3 todos from `GET /session/:id/todo`
- Loaded lazily via Intersection Observer — only when `AgentRow` is in viewport
- Shows todo `content` with a status icon: pending / in_progress / completed
- Does not show cancelled todos

### `DiffPreview` (`diff-preview.tsx`)

- Fetches `GET /session/:id/diff` lazily (same Intersection Observer as TodoList)
- Shows count of modified files: e.g. "3 files changed"
- No inline diff rendering in this MVP

---

## 5. Session Status Badges

| Status | Badge style |
|--------|-------------|
| `busy` | Green dot with CSS pulse animation |
| `idle` | Grey dot, no animation |
| `retry` | Red dot; parent `AgentRow` gets red left border |

Sessions with `retry` status are sorted to the top of their `ProjectCard`. Projects are sorted in the grid by their most urgent session: projects with any `retry` session first, then projects with any `busy` session, then the rest.

---

## 6. Lazy Loading

Both `TodoList` and `DiffPreview` use the browser's `IntersectionObserver` to defer their API calls until the `AgentRow` is scrolled into view. This avoids loading data for projects/sessions that are off-screen.

SolidJS implementation: a `createVisible(ref)` primitive lives in `packages/app/src/primitives/create-visible.ts`. It takes a DOM `ref`, creates one `IntersectionObserver` per call site, and returns a reactive boolean `visible()`. Each `AgentRow` creates a single `createVisible` instance; `TodoList` and `DiffPreview` receive `visible` as a prop and only mount their fetch logic when it is `true`.

---

## 7. Navigation

| Action | Destination |
|--------|-------------|
| Click project name in `ProjectCard` | `/:dir` (existing DirectoryLayout) |
| Click "Ver sesión" in `AgentRow` | `/:dir/session/:id` (existing SessionRoute) |
| Click Mission Control icon in sidebar | `/mission-control` |

No new routes are added beyond `/mission-control` itself. All navigation reuses existing routes.

---

## 8. Out of Scope (MVP)

The following are explicitly excluded from this iteration:

- Filter or search across projects/sessions
- Approving or rejecting diffs from Mission Control (done in session view)
- Historical metrics for idle/completed sessions
- Charts or metric visualizations
- GCP / Firebase deploy skills
- Session creation from Mission Control

These are candidates for a second iteration.

---

## 9. Testing Approach

- **Unit tests** for `StatsBar` count derivation logic (pure function, no side effects)
- **Unit tests** for `MetricsBar` aggregation logic (sum tokens/cost, handle all-zero case, handle new-busy-session event)
- **Component tests** (vitest + Testing Library) for `ProjectCard` and `AgentRow` rendering with mocked session data
- **Component tests** for `TodoList` and `DiffPreview`: verify they do not fetch when `visible` is `false`, and do fetch when `visible` becomes `true`
- **No E2E tests** in this iteration — the page is read-only and data comes from existing tested APIs

---

## 10. Implementation Order

1. Add route in `app.tsx` and stub `MissionControlPage`
2. Add sidebar icon in `sidebar-shell.tsx`
3. Implement `createVisible` primitive in `src/primitives/create-visible.ts`
4. Implement `StatsBar` (reactive counts)
5. Implement `ProjectCard` + `AgentRow` with status badges
6. Implement `TodoList` with lazy loading (uses `createVisible`)
7. Implement `DiffPreview` with lazy loading (uses `createVisible`)
8. Implement `MetricsBar` with token/cost aggregation and SSE reactivity
9. Wire sorting (retry → busy → idle) at both page level (projects grid) and card level (sessions within card)
10. Add unit tests for aggregation and count derivation logic
11. Add component tests for card/row rendering and lazy loading behavior
