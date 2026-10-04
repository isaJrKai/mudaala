// Site footer - the quiet bottom rail with the legal links: Safety, Privacy
// and Terms. NOT rendered by the root layout; every surface declares its own
// footer explicitly, so the app shell, the public ad and shop pages and the
// legal pages each carry exactly ONE footer.
//
// padded: inside the app shell (desktop sidebar offset + mobile bottom-nav
// clearance + sticky bottom via mt-auto). Default: full-width pages.

import Link from 'next/link'
import { copy } from '@/lib/copy'
import { cn } from '@/lib/utils'

export function SiteFooter({ padded = false }: { padded?: boolean }) {
  return (
    <footer
      className={cn(
        'mt-auto border-t bg-muted/40',
        padded && 'pb-16 lg:pb-0',
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>
            <span className="font-display font-bold lowercase tracking-tight text-foreground">mudaala</span>{' '}
            {copy.app.footerLine}.
          </p>
          <p className="mt-0.5 text-xs">{copy.app.footerNote}</p>
        </div>
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
