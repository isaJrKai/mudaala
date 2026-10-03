// Site footer — the quiet bottom rail with the legal links. Rendered by the
// root layout so every page (app, public ad pages, legal pages) carries the
// same three doors: Safety, Privacy and Terms.

import Link from 'next/link'
import { copy } from '@/lib/copy'

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display font-bold lowercase tracking-tight text-foreground">mudaala</span>
          {' '}
          {copy.app.footerLine}.
        </p>
        <nav aria-label="Legal" className="flex items-center gap-4">
          <Link href="/safety" className="hover:text-foreground hover:underline">
            Safety
          </Link>
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  )
}
