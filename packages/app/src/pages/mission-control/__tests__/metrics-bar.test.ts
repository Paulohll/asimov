import { describe, expect, test } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2/client"

// Pure aggregation logic extracted from MetricsBar for unit testing
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

function sum(results: Totals[]): Totals {
  return results.reduce((acc, r) => ({ tokens: acc.tokens + r.tokens, cost: acc.cost + r.cost }), {
    tokens: 0,
    cost: 0,
  })
}

const msg = (input: number, output: number, cost: number): Message =>
  ({
    role: "assistant",
    tokens: { input, output, reasoning: 0, cache: { read: 0, write: 0 } },
    cost,
  }) as unknown as Message

const userMsg = (): Message => ({ role: "user" }) as unknown as Message

describe("MetricsBar aggregation", () => {
  test("single session with tokens and cost", () => {
    const result = aggregate([msg(100, 200, 0.005)])
    expect(result.tokens).toBe(300)
    expect(result.cost).toBeCloseTo(0.005)
  })

  test("ignores user messages", () => {
    const result = aggregate([userMsg(), msg(50, 50, 0.001)])
    expect(result.tokens).toBe(100)
  })

  test("sums two sessions", () => {
    const a = aggregate([msg(100, 100, 0.01)])
    const b = aggregate([msg(200, 200, 0.02)])
    const total = sum([a, b])
    expect(total.tokens).toBe(600)
    expect(total.cost).toBeCloseTo(0.03)
  })

  test("all-zero cost returns cost=0", () => {
    const result = aggregate([msg(100, 100, 0), msg(50, 50, 0)])
    expect(result.cost).toBe(0)
    expect(result.tokens).toBe(300)
  })

  test("empty messages returns zeros", () => {
    expect(aggregate([])).toEqual({ tokens: 0, cost: 0 })
  })
})
