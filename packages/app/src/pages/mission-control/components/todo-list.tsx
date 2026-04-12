import { For } from "solid-js"
import type { Todo } from "@opencode-ai/sdk/v2/client"

function TodoIcon(props: { status: string }) {
  if (props.status === "completed") return <span class="text-icon-success-base text-11-regular">✓</span>
  if (props.status === "in_progress") return <span class="text-icon-info-base text-11-regular">→</span>
  return <span class="text-text-weak text-11-regular">○</span>
}

export function TodoList(props: { todos: Todo[] }) {
  return (
    <div class="flex flex-col gap-0.5 pl-4">
      <For each={props.todos.slice(0, 3).filter((t) => t.status !== "cancelled")}>
        {(todo) => (
          <div class="flex items-start gap-1.5">
            <TodoIcon status={todo.status} />
            <span class="text-12-regular text-text-base truncate">{todo.content}</span>
          </div>
        )}
      </For>
    </div>
  )
}
