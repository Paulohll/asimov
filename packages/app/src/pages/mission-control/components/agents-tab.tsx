import { createResource, For, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import type { Agent } from "@opencode-ai/sdk/v2/client"

function AgentBadge(props: { native?: boolean }) {
  return (
    <span
      classList={{
        "text-10-regular px-1.5 py-0.5 rounded-md shrink-0": true,
        "bg-surface-raised-base text-text-weak": props.native,
        "bg-icon-info-base/15 text-icon-info-base": !props.native,
      }}
    >
      {props.native ? "native" : "custom"}
    </span>
  )
}

function ModelTag(props: { agent: Agent }) {
  const model = () => props.agent.model
  if (!model()) return null
  return (
    <span class="text-11-regular text-text-weak font-mono truncate">
      {model()!.providerID}/{model()!.modelID}
    </span>
  )
}

function AgentCard(props: { agent: Agent }) {
  return (
    <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border-weak-base bg-surface-base">
      <div class="flex items-center gap-2">
        <Show when={props.agent.color}>
          <span class="size-2.5 rounded-full shrink-0" style={{ background: props.agent.color }} />
        </Show>
        <span class="text-13-medium text-text-strong">{props.agent.name}</span>
        <AgentBadge native={props.agent.native} />
        <Show when={props.agent.mode === "all"}>
          <span class="text-10-regular px-1.5 py-0.5 rounded-md bg-surface-raised-base text-text-weak shrink-0">
            all
          </span>
        </Show>
      </div>
      <Show when={props.agent.description}>
        <p class="text-12-regular text-text-base">{props.agent.description}</p>
      </Show>
      <ModelTag agent={props.agent} />
    </div>
  )
}

export function AgentsTab() {
  const sdk = useGlobalSDK()
  const [agents] = createResource(() => sdk.client.app.agents().then((r) => r.data ?? []))

  const primary = () => agents()?.filter((a) => a.mode !== "subagent" && !a.hidden) ?? []
  const system = () => agents()?.filter((a) => a.hidden) ?? []
  const subs = () => agents()?.filter((a) => a.mode === "subagent" && !a.hidden) ?? []

  return (
    <div class="flex flex-col gap-6 p-6">
      <Show when={agents.loading}>
        <p class="text-13-regular text-text-weak">Loading agents...</p>
      </Show>

      <Show when={!agents.loading}>
        <section class="flex flex-col gap-3">
          <h2 class="text-12-medium text-text-weak uppercase tracking-wide">Primary ({primary().length})</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <For each={primary()}>{(agent) => <AgentCard agent={agent} />}</For>
          </div>
        </section>

        <Show when={subs().length > 0}>
          <section class="flex flex-col gap-3">
            <h2 class="text-12-medium text-text-weak uppercase tracking-wide">Subagents ({subs().length})</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <For each={subs()}>{(agent) => <AgentCard agent={agent} />}</For>
            </div>
          </section>
        </Show>

        <Show when={system().length > 0}>
          <section class="flex flex-col gap-3">
            <h2 class="text-12-medium text-text-weak uppercase tracking-wide">System / Hidden ({system().length})</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <For each={system()}>{(agent) => <AgentCard agent={agent} />}</For>
            </div>
          </section>
        </Show>
      </Show>
    </div>
  )
}
