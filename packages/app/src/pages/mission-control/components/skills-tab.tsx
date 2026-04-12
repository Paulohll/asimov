import { createResource, For, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"

type Skill = { name: string; description: string; location: string; content: string }

function shortenPath(location: string): string {
  const home = "/home/"
  const idx = location.indexOf(home)
  if (idx === -1) return location
  const parts = location.slice(idx + home.length).split("/")
  return "~/" + parts.slice(1).join("/")
}

function SkillCard(props: { skill: Skill }) {
  const short = () => shortenPath(props.skill.location)
  return (
    <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border-weak-base bg-surface-base min-w-0">
      <span class="text-13-medium text-text-strong">{props.skill.name}</span>
      <Show when={props.skill.description}>
        <p class="text-12-regular text-text-base">{props.skill.description}</p>
      </Show>
      <span class="text-11-regular text-text-weak font-mono truncate" title={props.skill.location}>
        {short()}
      </span>
    </div>
  )
}

function EmptySkills() {
  const paths = [
    "~/.agents/skills/**/SKILL.md",
    "~/.claude/skills/**/SKILL.md",
    ".opencode/skills/**/SKILL.md",
    "opencode.json → skills.paths[]",
  ]
  return (
    <div class="flex flex-col gap-3 p-4 rounded-xl border border-border-weak-base bg-surface-base max-w-md">
      <p class="text-13-medium text-text-strong">No skills loaded</p>
      <p class="text-12-regular text-text-weak">OpenCode looks for skills in these locations:</p>
      <ul class="flex flex-col gap-1">
        <For each={paths}>
          {(p) => (
            <li class="text-11-regular text-text-weak font-mono bg-surface-raised-base px-2 py-1 rounded">{p}</li>
          )}
        </For>
      </ul>
    </div>
  )
}

export function SkillsTab() {
  const sdk = useGlobalSDK()
  const [skills] = createResource(() => sdk.client.app.skills().then((r) => r.data ?? []))

  return (
    <div class="flex flex-col gap-4 p-6">
      <Show when={skills.loading}>
        <p class="text-13-regular text-text-weak">Loading skills...</p>
      </Show>

      <Show when={!skills.loading && (skills() ?? []).length === 0}>
        <EmptySkills />
      </Show>

      <Show when={(skills() ?? []).length > 0}>
        <div class="flex flex-col gap-1 mb-2">
          <span class="text-12-medium text-text-weak uppercase tracking-wide">Skills ({skills()!.length})</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <For each={skills()}>{(skill) => <SkillCard skill={skill} />}</For>
        </div>
      </Show>
    </div>
  )
}
