import { describe, expect, test } from "bun:test"
import type { SessionStatus } from "@opencode-ai/sdk/v2/client"

// Test the pure count derivation logic, extracted from StatsBar
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

const busy: SessionStatus = { type: "busy" }
const idle: SessionStatus = { type: "idle" }
const retry: SessionStatus = { type: "retry", attempt: 1, message: "err", next: 0 }

describe("StatsBar count derivation", () => {
  test("all-zero on empty map", () => {
    expect(count({})).toEqual({ busy: 0, idle: 0, retry: 0 })
  })

  test("counts single busy session", () => {
    expect(count({ ses_1: busy })).toEqual({ busy: 1, idle: 0, retry: 0 })
  })

  test("counts mixed statuses", () => {
    expect(count({ a: busy, b: idle, c: retry, d: busy })).toEqual({ busy: 2, idle: 1, retry: 1 })
  })

  test("all retry", () => {
    expect(count({ a: retry, b: retry })).toEqual({ busy: 0, idle: 0, retry: 2 })
  })

  test("ignores undefined entries", () => {
    expect(count({ a: undefined, b: busy })).toEqual({ busy: 1, idle: 0, retry: 0 })
  })
})
