import { Icon } from "@opencode-ai/ui/icon"

export default function MissionControlPage() {
  return (
    <div class="flex flex-col h-full p-6 gap-6">
      <div class="flex items-center gap-3">
        <Icon name="checklist" size="large" />
        <h1 class="text-18-medium text-text-strong">Mission Control</h1>
      </div>
      <div class="text-14-regular text-text-weak">Loading...</div>
    </div>
  )
}
