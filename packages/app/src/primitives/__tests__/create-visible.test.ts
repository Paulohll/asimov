import { describe, expect, test, mock, beforeEach } from "bun:test"

// Mock IntersectionObserver before importing the primitive
let observerCallback: IntersectionObserverCallback
const observeMock = mock(() => {})
const disconnectMock = mock(() => {})

beforeEach(() => {
  observeMock.mockClear()
  disconnectMock.mockClear()
  ;(globalThis as any).IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      observerCallback = cb
    }
    observe = observeMock
    disconnect = disconnectMock
  }
})

import { createRoot } from "solid-js"
import { createVisible } from "../../primitives/create-visible"

describe("createVisible", () => {
  test("returns false before intersection fires", () => {
    createRoot((dispose) => {
      const el = document.createElement("div")
      const visible = createVisible(() => el)
      expect(visible()).toBe(false)
      dispose()
    })
  })

  test("returns true after intersection callback fires with isIntersecting=true", () => {
    createRoot((dispose) => {
      const el = document.createElement("div")
      const visible = createVisible(() => el)
      observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      expect(visible()).toBe(true)
      dispose()
    })
  })

  test("disconnects observer after first intersection", () => {
    createRoot((dispose) => {
      const el = document.createElement("div")
      createVisible(() => el)
      observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      expect(disconnectMock).toHaveBeenCalledTimes(1)
      dispose()
    })
  })

  test("does not set true when isIntersecting=false", () => {
    createRoot((dispose) => {
      const el = document.createElement("div")
      const visible = createVisible(() => el)
      observerCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
      expect(visible()).toBe(false)
      dispose()
    })
  })

  test("returns false signal when ref returns undefined", () => {
    createRoot((dispose) => {
      const visible = createVisible(() => undefined)
      expect(visible()).toBe(false)
      dispose()
    })
  })
})
