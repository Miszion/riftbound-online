'use client'

type Listener = (count: number) => void

class NetworkActivityTracker {
  private activeCount = 0
  private listeners = new Set<Listener>()

  private notify() {
    for (const listener of this.listeners) {
      listener(this.activeCount)
    }
  }

  start() {
    this.activeCount += 1
    this.notify()
  }

  stop() {
    this.activeCount = Math.max(0, this.activeCount - 1)
    this.notify()
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.activeCount)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const networkActivity = new NetworkActivityTracker()
