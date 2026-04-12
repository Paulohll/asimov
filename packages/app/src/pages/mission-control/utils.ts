import type { SessionStatus } from "@opencode-ai/sdk/v2/client"

export function urgency(status: SessionStatus | undefined): number {
  if (!status) return 0
  if (status.type === "retry") return 2
  if (status.type === "busy") return 1
  return 0
}

export function sortByUrgency<T>(items: T[], getStatus: (item: T) => SessionStatus | undefined): T[] {
  return items.slice().sort((a, b) => urgency(getStatus(b)) - urgency(getStatus(a)))
}
