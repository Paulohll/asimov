import { createMemo, For } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import type { SessionStatus } from "@opencode-ai/sdk/v2/client"

type Counts = { busy: number; idle: number; retry: number }

function count(statuses: Record<string, SessionStatus | undefined>): Counts {
  return Object.values(statuses).reduce<Counts>(
    (acc, s) => {
      if (!s) return acc
      acc[s.type] = (acc[s.type] ?? 0) + 1
      return acc
    },
    { busy: 0, idle: 0, retry: 0 },
  )
}

export function StatsBar() {
  const sync = useGlobalSync()

  const counts = createMemo(() => {
    const all: Counts = { busy: 0, idle: 0, retry: 0 }
    for (const project of sync.data.project) {
      const [child] = sync.child(project.worktree, { bootstrap: false })
      const c = count(child.session_status)
      all.busy += c.busy
      all.idle += c.idle
      all.retry += c.retry
    }
    return all
  })

  const items = createMemo(() => [
    { label: "busy", dot: "bg-icon-success-base", color: "text-icon-success-base", count: counts().busy },
    { label: "idle", dot: "bg-border-base-base", color: "text-text-weak", count: counts().idle },
    { label: "retry", dot: "bg-icon-critical-base", color: "text-icon-critical-base", count: counts().retry },
  ])

  return (
    <div class="flex items-center gap-4 px-1 py-2">
      <For each={items()}>
        {(item) => (
          <div class="flex items-center gap-1.5">
            <span
              classList={{
                "size-2 rounded-full shrink-0": true,
                [item.dot]: true,
                "animate-pulse": item.label === "busy",
              }}
            />
            <span
              classList={{
                "text-12-regular": true,
                [item.color]: true,
              }}
            >
              {item.count} {item.label}
            </span>
          </div>
        )}
      </For>
    </div>
  )
}
