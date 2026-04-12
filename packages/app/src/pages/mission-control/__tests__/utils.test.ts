import { describe, expect, test } from "bun:test"
import type { SessionStatus } from "@opencode-ai/sdk/v2/client"
import { urgency, sortByUrgency } from "../utils"

const busy: SessionStatus = { type: "busy" }
const idle: SessionStatus = { type: "idle" }
const retry: SessionStatus = { type: "retry", attempt: 1, message: "err", next: 0 }

describe("urgency", () => {
  test("retry = 2", () => expect(urgency(retry)).toBe(2))
  test("busy = 1", () => expect(urgency(busy)).toBe(1))
  test("idle = 0", () => expect(urgency(idle)).toBe(0))
  test("undefined = 0", () => expect(urgency(undefined)).toBe(0))
})

describe("sortByUrgency", () => {
  test("empty list returns empty", () => {
    expect(sortByUrgency([], () => undefined)).toEqual([])
  })

  test("single item returns same", () => {
    const items = [{ id: "a" }]
    expect(sortByUrgency(items, () => busy)).toEqual(items)
  })

  test("retry before busy before idle", () => {
    const items = [
      { id: "idle", s: idle },
      { id: "busy", s: busy },
      { id: "retry", s: retry },
    ]
    const result = sortByUrgency(items, (x) => x.s)
    expect(result.map((x) => x.id)).toEqual(["retry", "busy", "idle"])
  })

  test("all same status preserves relative order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const result = sortByUrgency(items, () => busy)
    expect(result.map((x) => x.id)).toEqual(["a", "b", "c"])
  })

  test("does not mutate original array", () => {
    const items = [
      { id: "idle", s: idle },
      { id: "retry", s: retry },
    ]
    const copy = [...items]
    sortByUrgency(items, (x) => x.s)
    expect(items).toEqual(copy)
  })
})
