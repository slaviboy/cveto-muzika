import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage wrapper that never throws (private mode, quota, disabled storage) and coalesces
 * rapid writes — slider drags would otherwise serialize the whole state on every pointer move.
 */
export function createDebouncedStorage(delayMs = 300, backend: () => Storage | undefined = safeLocalStorage): StateStorage & { flush(): void } {
  const pending = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const store = backend()
    for (const [key, value] of pending) {
      try {
        store?.setItem(key, value)
      } catch {
        // Quota exceeded or storage disabled: settings simply stay in memory.
      }
    }
    pending.clear()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem(name) {
      if (pending.has(name)) return pending.get(name) ?? null
      try {
        return backend()?.getItem(name) ?? null
      } catch {
        return null
      }
    },
    setItem(name, value) {
      pending.set(name, value)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    removeItem(name) {
      pending.delete(name)
      try {
        backend()?.removeItem(name)
      } catch {
        // ignore
      }
    },
    flush,
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined
  } catch {
    return undefined
  }
}
