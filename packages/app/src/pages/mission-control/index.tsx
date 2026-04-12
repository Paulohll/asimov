import { createMemo, For } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import type { Project } from "@opencode-ai/sdk/v2/client"
import { StatsBar } from "./components/stats-bar"
import { MetricsBar } from "./components/metrics-bar"
import { ProjectCard } from "./components/project-card"
import { urgency } from "./utils"

export default function MissionControlPage() {
  const sync = useGlobalSync()

  const data = createMemo(() =>
    sync.data.project.map((project: Project) => {
      const [child] = sync.child(project.worktree, { bootstrap: false })
      return {
        project,
        sessions: child.session.filter((s) => !s.time.archived),
        statuses: child.session_status,
        todos: child.todo,
        diffs: child.session_diff,
      }
    }),
  )

  const sorted = createMemo(() =>
    data()
      .slice()
      .sort((a, b) => {
        const ua = Math.max(0, ...a.sessions.map((s) => urgency(a.statuses[s.id])))
        const ub = Math.max(0, ...b.sessions.map((s) => urgency(b.statuses[s.id])))
        return ub - ua
      }),
  )

  return (
    <div class="flex flex-col h-full overflow-y-auto">
      <div class="shrink-0 px-6 pt-6 pb-3 flex flex-col gap-1 border-b border-border-weak-base">
        <h1 class="text-18-medium text-text-strong">Mission Control</h1>
        <StatsBar />
        <MetricsBar />
      </div>

      <div class="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
        <For each={sorted()}>
          {(item) => (
            <ProjectCard
              project={item.project}
              sessions={item.sessions}
              statuses={item.statuses}
              todos={item.todos}
              diffs={item.diffs}
            />
          )}
        </For>
      </div>
    </div>
  )
}
