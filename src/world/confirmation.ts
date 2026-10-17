/** One UI-independent confirmation channel. No consumer means deny. */
export interface ConfirmationRequest {
  id: number
  type: 'REPLACE_WORLD' | 'DELETE' | 'OVERWRITE_SAVE'
  message: string
}
type Listener = () => void
const listeners = new Set<Listener>()
let consumers = 0
let pending: ConfirmationRequest | null = null
let settle: ((accepted: boolean) => void) | null = null
let nextId = 0

/** Test / recovery helper — rejects any in-flight request and clears channel state. */
export function resetConfirmationChannel() {
  if (pending) {
    const resolve = settle
    pending = null
    settle = null
    resolve?.(false)
  }
  listeners.clear()
  consumers = 0
}

export const getConfirmation = () => pending
export function resolveConfirmation(id: number, accepted: boolean) {
  if (pending?.id !== id) return
  const resolve = settle
  pending = null
  settle = null
  listeners.forEach((notify) => notify())
  resolve?.(accepted)
}
export function subscribeConfirmation(listener: Listener, consumer = true) {
  listeners.add(listener)
  if (consumer) ++consumers
  return () => {
    listeners.delete(listener)
    if (consumer) --consumers
    if (!consumers && pending) resolveConfirmation(pending.id, false)
  }
}
export function requestConfirmation(input: Omit<ConfirmationRequest, 'id'>): Promise<boolean> {
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message) return Promise.resolve(false)
  if (!consumers || pending) return Promise.resolve(false)
  return new Promise((resolve) => {
    settle = resolve
    pending = { ...input, message, id: ++nextId }
    try {
      listeners.forEach((notify) => notify())
    } catch {
      // A buggy subscriber must not leave the channel stuck open.
      pending = null
      settle = null
      resolve(false)
    }
  })
}
export const confirmReplace = (message: string) => requestConfirmation({ type: 'REPLACE_WORLD', message })
