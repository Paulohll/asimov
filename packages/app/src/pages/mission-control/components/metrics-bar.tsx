import { createEffect, createMemo, createSignal, For } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { useGlobalSDK } from "@/context/global-sdk"
import type { Message } from "@opencode-ai/sdk/v2/client"

type Totals = { tokens: number; cost: number }

function aggregate(messages: Message[]): Totals {
  return messages.reduce<Totals>(
    (acc, m) => {
      if (m.role !== "assistant") return acc
      acc.tokens += (m.tokens.input ?? 0) + (m.tokens.output ?? 0)
      acc.cost += m.cost ?? 0
      return acc
    },
    { tokens: 0, cost: 0 },
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function MetricsBar() {
  const sync = useGlobalSync()
  const sdk = useGlobalSDK()
  const [totals, setTotals] = createSignal<Totals>({ tokens: 0, cost: 0 })
  const [noCost, setNoCost] = createSignal(false)

  const busyIds = createMemo(() => {
    const result: { dir: string; id: string }[] = []
    for (const project of sync.data.project) {
      const [child] = sync.child(project.worktree, { bootstrap: false })
      for (const [id, s] of Object.entries(child.session_status)) {
        if (s?.type === "busy") result.push({ dir: project.worktree, id })
      }
    }
    return result
  })

  createEffect(() => {
    const sessions = busyIds()
    if (sessions.length === 0) {
      setTotals({ tokens: 0, cost: 0 })
      return
    }

    void Promise.all(
      sessions.map(({ dir, id }) =>
        sdk.client.session
          .messages({ directory: dir, sessionID: id, limit: 200 })
          .then((r) => aggregate((r.data ?? []).flatMap((x) => (x.info ? [x.info as Message] : []))))
          .catch(() => ({ tokens: 0, cost: 0 }) as Totals),
      ),
    ).then((results) => {
      const sum = results.reduce((acc, r) => ({ tokens: acc.tokens + r.tokens, cost: acc.cost + r.cost }), {
        tokens: 0,
        cost: 0,
      })
      setTotals(sum)
      setNoCost(sum.cost === 0 && results.length > 0)
    })
  })

  const items = createMemo(() => {
    const t = totals()
    if (t.tokens === 0) return []
    return [{ label: `${fmt(t.tokens)} tokens` }, noCost() ? { label: "cost N/A" } : { label: `$${t.cost.toFixed(4)}` }]
  })

  return (
    <div class="flex items-center gap-3 px-1 py-1 text-12-regular text-text-weak">
      <For each={items()}>
        {(item, i) => (
          <>
            {i() > 0 && <span>·</span>}
            <span>{item.label}</span>
          </>
        )}
      </For>
    </div>
  )
}
