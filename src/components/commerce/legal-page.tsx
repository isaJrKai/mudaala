// Shared server component for the legal pages (/privacy, /terms, /safety).
// Each page renders its markdown file from /content — the text lives in
// content/<name>.md so it can be updated by editing the file, with no code
// change and no redeploy of the app logic. A missing file renders an honest
// "coming soon" body instead of crashing the page.
// (The site footer comes from the root layout — every route gets it once.)

import { promises as fs } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import type { Metadata } from 'next'
import { renderMarkdown } from '@/lib/markdown'

export interface LegalDoc {
  file: string
  title: string
  description: string
}

export function legalPageMetadata({ title, description }: LegalDoc): Metadata {
  return { title, description }
}

export async function LegalPage({ file, title, description }: LegalDoc) {
  let source: string | null = null
  try {
    source = await fs.readFile(path.join(process.cwd(), 'content', file), 'utf8')
  } catch {
    source = null
  }

  // The page supplies the document title; the markdown's own first "# "
  // heading would only duplicate it, so it is dropped before rendering.
  const body = source?.replace(/^\s*#\s+.*\n/, '') ?? null

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b bg-primary px-4 py-3 text-primary-foreground">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <Link href="/" className="font-display text-lg font-bold lowercase tracking-tight">
            mudaala
          </Link>
          <Link href="/" className="text-sm underline underline-offset-2 opacity-90 hover:opacity-100">
            Back to the market
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="font-display mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mb-8 text-muted-foreground">{description}</p>
        {body === null ? (
          <div className="rounded-xl border border-dashed p-6 text-muted-foreground">
            This document is being written. It will appear here as soon as the text is in
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-sm">content/{file}</code>.
          </div>
        ) : (
          <article className="text-[15px] text-foreground/90">{renderMarkdown(body)}</article>
        )}
      </main>
    </div>
  )
}
