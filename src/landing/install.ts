/**
 * "Install app" support for the landing page (PWA install).
 *
 * Chromium browsers (Chrome, Edge, Android, Quest Browser) fire `beforeinstallprompt` once the
 * manifest + service worker are in place; we stash that event so a button can show the native
 * install dialog later. Safari and Firefox never fire it, so the UI falls back to instructions.
 */

import { useSyncExternalStore } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'available' | 'installed' | 'manual'

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Call once at startup, before React renders, so an early `beforeinstallprompt` isn't missed. */
export function setupInstall() {
  if (typeof window === 'undefined') return
  installed = isStandalone()
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
        console.warn('[RealmForge] Service worker registration failed', error)
      })
    })
  }
}

function getState(): InstallState {
  if (installed) return 'installed'
  return deferred ? 'available' : 'manual'
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getState, () => 'manual')
}

/** Show the browser's install dialog. Returns false when no prompt is available. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

/** Platform-specific steps for browsers without a native install prompt. */
export function manualInstallHint(userAgent = navigator.userAgent): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'On iPhone or iPad: tap Share, then “Add to Home Screen”.'
  if (/Macintosh/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent)) {
    return 'In Safari: choose File → “Add to Dock”.'
  }
  if (/Firefox/i.test(userAgent)) return 'Firefox can’t install web apps — open RealmForge in Chrome or Edge to install it.'
  return 'Use the install icon in your browser’s address bar, or the browser menu → “Install RealmForge XR”.'
}
