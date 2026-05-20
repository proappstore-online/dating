import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<(canInstall: boolean) => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    for (const l of listeners) l(true)
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    for (const l of listeners) l(false)
  })
}

/**
 * React hook for the PWA install prompt. Returns `canInstall: true` once
 * the browser has fired `beforeinstallprompt` (i.e. the user passes the
 * install criteria but hasn't installed yet); `prompt()` triggers the
 * native UI. iOS Safari never fires the event — caller should fall back
 * to an "Add to Home Screen" tooltip.
 */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferred)
  useEffect(() => {
    listeners.add(setCanInstall)
    return () => { listeners.delete(setCanInstall) }
  }, [])

  async function prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferred) return 'unavailable'
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    for (const l of listeners) l(false)
    return outcome
  }

  return { canInstall, prompt }
}

/**
 * Best-effort detection of whether the user is already running the
 * installed PWA (vs the in-browser tab). True when the display mode
 * matches the standalone manifest.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // Chromium / Android / desktop
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone === true) return true
  return false
}
