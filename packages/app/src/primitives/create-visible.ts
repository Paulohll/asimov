import { createSignal, onCleanup } from "solid-js"

export function createVisible(ref: () => Element | undefined) {
  const [visible, setVisible] = createSignal(false)

  const el = ref()
  if (!el) return visible

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    },
    { threshold: 0.1 },
  )

  observer.observe(el)
  onCleanup(() => observer.disconnect())

  return visible
}
