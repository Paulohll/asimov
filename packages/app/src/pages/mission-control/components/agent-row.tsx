import { createMemo, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Button } from "@opencode-ai/ui/button"
import type { Session, SessionStatus, Todo } from "@opencode-ai/sdk/v2/client"
import { TodoList } from "./todo-list"
import { DiffPreview } from "./diff-preview"

function StatusDot(props: { status: SessionStatus["type"] }) {
  return (
    <span
      classList={{
        "size-2 rounded-full shrink-0": true,
        "bg-icon-success-base animate-pulse": props.status === "busy",
        "bg-border-base-base": props.status === "idle",
        "bg-icon-critical-base": props.status === "retry",
      }}
    />
  )
}

export function AgentRow(props: {
  session: Session
  status: SessionStatus | undefined
  todo: Todo[]
  diffCount: number
}) {
  const navigate = useNavigate()
  const status = createMemo(() => props.status?.type ?? "idle")
  const label = createMemo(() => props.session.title || props.session.id)
  const href = createMemo(() => `/${base64Encode(props.session.directory)}/session/${props.session.id}`)

  return (
    <div
      classList={{
        "flex flex-col gap-2 p-3 rounded-lg border": true,
        "border-border-weak-base": status() !== "retry",
        "border-icon-critical-base border-l-2": status() === "retry",
      }}
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <StatusDot status={status()} />
          <span class="text-13-medium text-text-strong truncate">{label()}</span>
        </div>
        <Button size="normal" variant="ghost" class="shrink-0 text-12-regular px-2" onClick={() => navigate(href())}>
          Ver sesión
        </Button>
      </div>

      <Show when={props.todo.length > 0}>
        <TodoList todos={props.todo} />
      </Show>

      <Show when={props.diffCount > 0}>
        <DiffPreview count={props.diffCount} />
      </Show>
    </div>
  )
}
