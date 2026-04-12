import { createMemo, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import type { Project, Session, SessionStatus, Todo, SnapshotFileDiff } from "@opencode-ai/sdk/v2/client"
import { AgentRow } from "./agent-row"
function urgency(status: SessionStatus | undefined): number {
  if (!status) return 0
  if (status.type === "retry") return 2
  if (status.type === "busy") return 1
  return 0
}

export function ProjectCard(props: {
  project: Project
  sessions: Session[]
  statuses: Record<string, SessionStatus | undefined>
  todos: Record<string, Todo[]>
  diffs: Record<string, SnapshotFileDiff[]>
}) {
  const navigate = useNavigate()
  const name = createMemo(() => props.project.name || getFilename(props.project.worktree))

  const sorted = createMemo(() =>
    props.sessions.slice().sort((a, b) => urgency(props.statuses[b.id]) - urgency(props.statuses[a.id])),
  )

  return (
    <div class="flex flex-col gap-3 p-4 rounded-xl border border-border-weak-base bg-surface-base min-w-0">
      <button
        type="button"
        class="text-left text-14-medium text-text-strong hover:text-text-base truncate"
        onClick={() => navigate(`/${base64Encode(props.project.worktree)}`)}
      >
        {name()}
      </button>

      <Show when={sorted().length > 0} fallback={<p class="text-12-regular text-text-weak">No active agents</p>}>
        <div class="flex flex-col gap-2">
          <For each={sorted()}>
            {(session) => (
              <AgentRow
                session={session}
                status={props.statuses[session.id]}
                todo={(props.todos[session.id] ?? []).filter((t) => t.status !== "cancelled")}
                diffCount={props.diffs[session.id]?.length ?? 0}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
