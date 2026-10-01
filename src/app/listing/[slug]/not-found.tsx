import { Store } from 'lucide-react'

// Route-scoped 404 for public ad links: shared links outlive listings, so a
// missing ad gets an honest page that sends the visitor into the market.
export default function ListingNotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <a href="/" className="font-display text-[19px] font-bold lowercase leading-none tracking-tight text-primary">
            mudaala
          </a>
          <span className="text-xs text-muted-foreground">Uganda · trade directly</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent">
          <Store className="size-6 text-accent-foreground" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">This ad is gone or never was</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Listings are removed when they are fulfilled, expired or withdrawn. The market moves fast — there is always
          something new.
        </p>
        <a
          href="/"
          className="press mt-6 flex h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open Mudaala
        </a>
      </main>
      <footer className="border-t bg-card py-4 text-center text-xs text-muted-foreground">
        Mudaala — local shops, bigger opportunities.
      </footer>
    </div>
  )
}
