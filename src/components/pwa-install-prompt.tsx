'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
      setHelpOpen(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || dismissed) return null

  async function install() {
    if (!installEvent) {
      setHelpOpen((open) => !open)
      return
    }
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstallEvent(null)
  }

  return (
    <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[80] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 lg:bottom-5 lg:right-5">
      {helpOpen && (
        <section className="w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-4 text-foreground shadow-lg" aria-live="polite">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="font-semibold">Get Mudaala on your device</h2>
            <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close install help" className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X size={17} />
            </button>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            { /iPhone|iPad|iPod/i.test(navigator.userAgent)
              ? 'On your iPhone or iPad, open this page in Safari, tap Share, then choose “Add to Home Screen”.'
              : /Android/i.test(navigator.userAgent)
                ? 'Open this page in Chrome, tap the browser menu, then choose “Install app” or “Add to Home screen”.'
                : 'In Chrome or Edge, use the install icon in the address bar, or open the browser menu and choose “Install Mudaala”.' }
          </p>
          <p className="mt-2 text-xs text-muted-foreground">No separate account or second app is needed. Sign in with your existing Mudaala account.</p>
        </section>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={install}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1d4a35] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#163a29] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4a35] focus-visible:ring-offset-2"
          aria-expanded={helpOpen}
        >
          <Download size={17} />
          {installEvent ? 'Install Mudaala' : 'Get the app'}
        </button>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Hide install button" className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
