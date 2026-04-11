---
goal: Implement Mission Control dashboard in OpenCode fork SolidJS frontend
version: 1.0
date_created: 2026-04-12
last_updated: 2026-04-12
owner: Platform / Superpowers
status: 'Planned'
tags: [feature, frontend, opencode-fork, mission-control]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Implementation plan for the Mission Control page described in the approved design spec (`2026-04-12-mission-control-opencode-design.md`). The deliverable is a new `/mission-control` route in the OpenCode fork's SolidJS frontend (`packages/app`) that renders a macro dashboard of all active AI agent sessions grouped by project. No backend changes, no OpenCode core changes — additions only.

---

## 1. Requirements & Constraints

- **REQ-001**: All new code lives inside the `packages/app` package of the OpenCode fork; no changes to other packages.
- **REQ-002**: The page must work exclusively with the existing OpenCode HTTP API endpoints (`GET /session/:id/message`, `GET /session/:id/todo`, `GET /session/:id/diff`) — no new backend endpoints.
- **REQ-003**: Session status must be derived reactively from `useGlobalSync()` / SSE — no polling.
- **REQ-004**: `TodoList` and `DiffPreview` data must be fetched lazily (only when the `AgentRow` enters the viewport) using the `createVisible` IntersectionObserver primitive.
- **REQ-005**: `MetricsBar` must fetch messages only for `busy` sessions; must show a "Cost not available" notice when all `cost` values are `0`.
- **REQ-006**: Projects sorted in grid: `retry` first, then `busy`, then `idle`. Sessions within a `ProjectCard` sorted the same way.
- **REQ-007**: `AgentRow` displays session `title`; falls back to session `id` if `title` is absent or empty.
- **REQ-008**: `retry` `AgentRow` must render a red left border; status dot is red. `busy` dot is green + pulse. `idle` dot is grey.
- **REQ-009**: Navigation targets `/:dir` (project) and `/:dir/session/:id` (session) must use the existing router — no new routes beyond `/mission-control`.
- **SEC-001**: No credentials or secrets are passed through the new components; all data comes from the existing authenticated SDK context.
- **CON-001**: SolidJS v1.x primitives only (`createSignal`, `createEffect`, `createMemo`, `onCleanup`). No third-party reactive libraries.
- **CON-002**: No inline diff rendering in this MVP (DiffPreview shows file count only).
- **CON-003**: No filter/search UI, no session creation from Mission Control.
- **PAT-001**: Follow the existing file conventions in `packages/app/src/pages/` (kebab-case directory, `index.tsx` as entry point, sub-components in `components/`).
- **PAT-002**: Use existing Tailwind CSS utility classes and design tokens already in use by the app; do not introduce new CSS files.
- **GUD-001**: All new components must be TypeScript strict; no `any` unless unavoidable and commented.
- **GUD-002**: Tests use vitest + Solid Testing Library, matching the existing test setup in `packages/app`.

---

## 2. Implementation Steps

### Implementation Phase 1 — Scaffolding & Routing

- GOAL-001: Wire the new route and add the sidebar entry point so the page is reachable before any real content is built.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | In `packages/app/src/app.tsx`, add `<Route path="/mission-control" component={MissionControlPage} />` and import the stub page component. | | |
| TASK-002 | Create `packages/app/src/pages/mission-control/index.tsx` with a stub `MissionControlPage` that renders a `<h1>Mission Control</h1>` placeholder. | | |
| TASK-003 | In `packages/app/src/pages/layout/sidebar-shell.tsx`, add a grid/dashboard Lucide icon (e.g. `LayoutDashboard`) that navigates to `/mission-control`. Place it after the existing navigation icons; keep the same icon-button pattern already used. | | |
| TASK-004 | Smoke-test: run `pnpm dev` in the fork, navigate to `/mission-control`, verify the page loads and the sidebar icon is present. | | |

### Implementation Phase 2 — `createVisible` Primitive

- GOAL-002: Provide a reusable SolidJS primitive for IntersectionObserver-based lazy loading, to be consumed by `TodoList` and `DiffPreview`.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | Create `packages/app/src/primitives/create-visible.ts`. The export is `createVisible(ref: Accessor<Element \| null>): Accessor<boolean>`. Internally: `createEffect` that instantiates one `IntersectionObserver`, sets a `createSignal(false)` to `true` on first intersection, and calls `observer.disconnect()` + `onCleanup` to avoid leaks. Once `true`, the observer is disconnected (load once on first visibility). | | |
| TASK-006 | Write a unit test for `createVisible` in `packages/app/src/primitives/__tests__/create-visible.test.ts` using a mocked `IntersectionObserver`. Verify: (a) returns `false` before intersection fires, (b) returns `true` after the callback is called, (c) observer is disconnected after first intersection. | | |

### Implementation Phase 3 — `StatsBar`

- GOAL-003: Render reactive session status counts (busy / idle / retry) derived from `useGlobalSync()` with no additional API calls.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-007 | Create `packages/app/src/pages/mission-control/components/stats-bar.tsx`. Props: `sessionStatus: Accessor<Record<string, SessionStatus>>`. Use `createMemo` to derive `{ busy, idle, retry }` counts by iterating the record values. Render three pill badges: green for busy, grey for idle, red/amber for retry. | | |
| TASK-008 | Integrate `StatsBar` into `MissionControlPage` (`index.tsx`): call `useGlobalSync()` to obtain `sessionStatus`, pass it to `StatsBar`. | | |
| TASK-009 | Write unit tests for the count derivation logic in `stats-bar.test.ts`. Cases: all-zero map, mixed statuses, all-retry. Test the pure derivation function exported separately (not the component) to keep tests fast. | | |

### Implementation Phase 4 — `ProjectCard` & `AgentRow`

- GOAL-004: Render the project grid with per-session rows and status badges, without lazy-loaded data yet.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-010 | Create `packages/app/src/pages/mission-control/components/agent-row.tsx`. Props: `session: SessionInfo`, `dir: string`, `visible: Accessor<boolean>`. Renders: session title (fallback to `id`), status badge dot, red left border when `retry`, and a "Ver sesión" `<A>` link to `/:dir/session/:id`. `TodoList` and `DiffPreview` are rendered as children but gated on `visible()`. | | |
| TASK-011 | Create `packages/app/src/pages/mission-control/components/project-card.tsx`. Props: `project: Project`, `sessions: SessionInfo[]`. Sorts sessions: `retry` → `busy` → `idle`. Renders `AgentRow` per session, or "no active agents" empty state when `sessions` is empty. Project name is an `<A>` link to `/:dir`. Uses `createVisible` once per `AgentRow` ref for the lazy gate. | | |
| TASK-012 | Update `MissionControlPage` to sort projects (retry → busy → idle based on most urgent session) and render `ProjectCard[]`. Use `createMemo` for sorted lists. | | |
| TASK-013 | Write component tests for `ProjectCard` and `AgentRow` in `__tests__/project-card.test.tsx` and `__tests__/agent-row.test.tsx`: render with mocked sessions, assert title/badge presence, assert empty state renders, assert "Ver sesión" link href. | | |

### Implementation Phase 5 — `TodoList` & `DiffPreview`

- GOAL-005: Implement lazy-loaded sub-components that fetch session data only when scrolled into view.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | Create `packages/app/src/pages/mission-control/components/todo-list.tsx`. Props: `sessionId: string`, `visible: Accessor<boolean>`. When `visible()` becomes `true`, fetch `GET /session/:sessionId/todo` via the SDK. Render top-3 non-cancelled todos with status icons: `completed` (✓), `in_progress` (→), `pending` (○). Show a loading skeleton while fetching; show nothing (no error state) if the request fails silently. | | |
| TASK-015 | Create `packages/app/src/pages/mission-control/components/diff-preview.tsx`. Props: `sessionId: string`, `visible: Accessor<boolean>`. When `visible()` becomes `true`, fetch `GET /session/:sessionId/diff` via the SDK. Render file count: `"N files changed"` (or `"No changes"` for 0). No inline diff. Silent on error. | | |
| TASK-016 | Wire `TodoList` and `DiffPreview` into `AgentRow`, passing the shared `visible` accessor. Each receives the session `id`. | | |
| TASK-017 | Write component tests for `TodoList` in `__tests__/todo-list.test.tsx`: (a) does NOT call fetch when `visible` is `false`; (b) calls fetch and renders results when `visible` becomes `true`; (c) filters out `cancelled` todos; (d) shows only top-3. | | |
| TASK-018 | Write component tests for `DiffPreview` in `__tests__/diff-preview.test.tsx`: (a) does NOT call fetch when `visible` is `false`; (b) renders `"N files changed"` when `visible` becomes `true`. | | |

### Implementation Phase 6 — `MetricsBar`

- GOAL-006: Aggregate token and cost totals for all currently-busy sessions, updating reactively as sessions change status via SSE.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Create `packages/app/src/pages/mission-control/components/metrics-bar.tsx`. Props: `busySessionIds: Accessor<string[]>`. On mount and whenever a new ID appears in `busySessionIds`, fetch `GET /session/:id/message` via the SDK for that session and sum `tokens.input + tokens.output` and `cost` across all messages. Store partial sums per sessionId in a `Map` (reactive via `createSignal`). If total cost is `0` across all sessions, render `"Cost not available for this provider"` instead of a dollar amount. | | |
| TASK-020 | Derive `busySessionIds` in `MissionControlPage` using `createMemo` over `sessionStatus`. Pass it to `MetricsBar`. | | |
| TASK-021 | Write unit tests for the aggregation logic in `metrics-bar.test.ts`. Cases: single busy session with tokens and cost; two sessions summed; all-zero cost triggers notice; new session added to busy list triggers fetch and adds to total. Export the pure aggregation function for unit testing. | | |

### Implementation Phase 7 — Sorting & Final Wiring

- GOAL-007: Complete the sorting logic and verify the full data flow end-to-end.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-022 | Extract a shared `sortByUrgency(sessions: SessionInfo[]): SessionInfo[]` utility in `packages/app/src/pages/mission-control/utils.ts`. Ordering: `retry` → `busy` → `idle`. Used by both `ProjectCard` (per-session sorting) and `MissionControlPage` (per-project sorting). | | |
| TASK-023 | Update `MissionControlPage` to use `sortByUrgency` for the project grid sort (project urgency = most urgent status among its sessions). | | |
| TASK-024 | Update `ProjectCard` to use `sortByUrgency` for the session list. | | |
| TASK-025 | Write unit tests for `sortByUrgency` in `utils.test.ts`: mixed statuses, all-same, empty list, single item. | | |

### Implementation Phase 8 — Code Review & CI

- GOAL-008: Ensure all new code passes the OpenCode fork's lint, type check, and test suite before the PR is opened.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-026 | Run `pnpm typecheck` in `packages/app`; fix all TypeScript errors. | | |
| TASK-027 | Run `pnpm lint` in `packages/app`; fix all ESLint warnings/errors. | | |
| TASK-028 | Run `pnpm test` (vitest) in `packages/app`; ensure all existing tests still pass and the new tests pass. | | |
| TASK-029 | Manual smoke-test: open the OpenCode fork in dev mode with at least 2 projects and 3+ sessions in mixed statuses. Verify: stats bar counts are correct, project sort order is correct, lazy loading fires only when rows are scrolled into view, "Ver sesión" navigation works, metrics bar shows token totals. | | |

---

## 3. Alternatives

- **ALT-001**: Add Mission Control as a floating panel / overlay rather than a dedicated route. Rejected — the spec explicitly chose Option A (dedicated `/mission-control` route) for navigational clarity and to avoid coupling it to any single session view.
- **ALT-002**: Poll the OpenCode API for session status instead of reusing `useGlobalSync()`. Rejected — SSE-driven reactivity is already built into the app; polling would add network overhead and latency.
- **ALT-003**: Use `@tanstack/solid-query` for lazy data fetching instead of a custom `createVisible` + `createEffect`. Rejected — the app's existing patterns use raw SDK calls with SolidJS primitives, and introducing a new library adds bundle weight for a read-only page.

---

## 4. Dependencies

- **DEP-001**: `@opencode-ai/sdk` — must expose `GET /session/:id/todo`, `GET /session/:id/diff`, and `GET /session/:id/message` typed methods. Verify types are available before starting Phase 5 & 6.
- **DEP-002**: `useGlobalSync()` must expose `projects: Accessor<Project[]>` and `sessionStatus: Accessor<Record<string, SessionStatus>>`. Inspect the current hook signature before starting Phase 3.
- **DEP-003**: `@solidjs/router` `<A>` component and `useNavigate()` — already a dependency; no version change needed.
- **DEP-004**: Lucide Solid icon set — confirm `LayoutDashboard` (or equivalent grid icon) is available in the version currently used by `packages/app`.

---

## 5. Files

- **FILE-001**: `packages/app/src/app.tsx` — add one `<Route>` and one import (modified).
- **FILE-002**: `packages/app/src/pages/layout/sidebar-shell.tsx` — add one icon nav entry (modified).
- **FILE-003**: `packages/app/src/primitives/create-visible.ts` — new IntersectionObserver primitive.
- **FILE-004**: `packages/app/src/pages/mission-control/index.tsx` — page root component.
- **FILE-005**: `packages/app/src/pages/mission-control/components/stats-bar.tsx` — status count bar.
- **FILE-006**: `packages/app/src/pages/mission-control/components/metrics-bar.tsx` — token/cost aggregation bar.
- **FILE-007**: `packages/app/src/pages/mission-control/components/project-card.tsx` — per-project card.
- **FILE-008**: `packages/app/src/pages/mission-control/components/agent-row.tsx` — per-session row.
- **FILE-009**: `packages/app/src/pages/mission-control/components/todo-list.tsx` — lazy todo sub-component.
- **FILE-010**: `packages/app/src/pages/mission-control/components/diff-preview.tsx` — lazy diff count sub-component.
- **FILE-011**: `packages/app/src/pages/mission-control/utils.ts` — `sortByUrgency` utility.
- **FILE-012**: `packages/app/src/primitives/__tests__/create-visible.test.ts` — unit tests for primitive.
- **FILE-013**: `packages/app/src/pages/mission-control/__tests__/stats-bar.test.ts` — unit tests.
- **FILE-014**: `packages/app/src/pages/mission-control/__tests__/metrics-bar.test.ts` — unit tests.
- **FILE-015**: `packages/app/src/pages/mission-control/__tests__/project-card.test.tsx` — component tests.
- **FILE-016**: `packages/app/src/pages/mission-control/__tests__/agent-row.test.tsx` — component tests.
- **FILE-017**: `packages/app/src/pages/mission-control/__tests__/todo-list.test.tsx` — component tests.
- **FILE-018**: `packages/app/src/pages/mission-control/__tests__/diff-preview.test.tsx` — component tests.
- **FILE-019**: `packages/app/src/pages/mission-control/__tests__/utils.test.ts` — unit tests for sort utility.

---

## 6. Testing

- **TEST-001**: `createVisible` primitive — mock `IntersectionObserver`; assert `false` before callback fires, `true` after, observer disconnected on first intersection.
- **TEST-002**: `sortByUrgency` utility — empty list, single item, mixed statuses (retry/busy/idle), all-same status.
- **TEST-003**: `StatsBar` count derivation — all-zero map, mixed statuses, all-retry; pure function tested without DOM rendering.
- **TEST-004**: `MetricsBar` aggregation — single session with cost; two sessions summed; all-zero cost shows notice; new session transitioning to busy triggers fetch and adds to total.
- **TEST-005**: `ProjectCard` component render — sessions present (renders AgentRows), sessions empty (renders empty state), project name link href is correct.
- **TEST-006**: `AgentRow` component render — busy/idle/retry badge classes; red left border on retry; "Ver sesión" link href; title fallback to `id`.
- **TEST-007**: `TodoList` — does not fetch when `visible=false`; fetches and renders top-3 when `visible=true`; cancelled todos excluded.
- **TEST-008**: `DiffPreview` — does not fetch when `visible=false`; renders `"N files changed"` when `visible=true`.

---

## 7. Risks & Assumptions

- **RISK-001**: `useGlobalSync()` may not currently expose `sessionStatus` as a `Record<sessionId, SessionStatus>` with the exact shape assumed. **Mitigation:** Inspect the hook before Phase 3 (TASK-008) and adapt the `StatsBar` props type accordingly.
- **RISK-002**: `GET /session/:id/todo` and `GET /session/:id/diff` may not yet be implemented in the SDK client. **Mitigation:** Verify SDK exports before Phase 5 (TASK-014); if missing, hand-write minimal typed fetch wrappers using the SDK's underlying `fetch` utility.
- **RISK-003**: The `IntersectionObserver` mock in vitest may require manual setup (jsdom does not implement it). **Mitigation:** Add a global mock in the test setup file before TASK-006.
- **RISK-004**: Many sessions simultaneously becoming `busy` could trigger a burst of `GET /session/:id/message` requests in `MetricsBar`. **Mitigation:** Acceptable for MVP given typical usage (< 20 sessions). A debounced or batched fetch is a follow-up.
- **ASSUMPTION-001**: The OpenCode fork uses vitest + Solid Testing Library (`@solidjs/testing-library`) in `packages/app`, consistent with what the spec references.
- **ASSUMPTION-002**: `SessionStatus` values in `useGlobalSync()` match the strings `"busy"`, `"idle"`, `"retry"` as stated in the spec.
- **ASSUMPTION-003**: Project objects from `useGlobalSync()` include a `path`/`dir` field usable for the `/:dir` route parameter.

---

## 8. Related Specifications / Further Reading

- [Mission Control Design Spec](./2026-04-12-mission-control-opencode-design.md)
- [Multi-Provider Agents Design](./2026-04-11-multi-provider-agents-design.md) — OpenCode provider context
- OpenCode HTTP API reference: `opencode serve --help` or upstream docs at https://opencode.ai/docs
