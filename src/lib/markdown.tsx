// Mudaala - a tiny Markdown renderer for the legal pages.
// Deliberately dependency-free: the legal text is written by people, in
// files under /content, and needs headings, paragraphs, lists, links, bold
// and rules - nothing else. Rendering to React elements (never an HTML
// string) keeps the pages safe by construction: there is no injection path.

import type { ReactNode } from 'react'

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'quote' | 'hr'
  lines?: string[] // list items / quote lines (raw inline markdown)
  text?: string // paragraph text (raw inline markdown)
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (trimmed === '') {
      flushParagraph()
      continue
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph()
      blocks.push({ kind: 'hr' })
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      const kind = (['h1', 'h2', 'h3'][heading[1]!.length - 1] ?? 'h3') as Block['kind']
      blocks.push({ kind, text: heading[2]! })
      continue
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'ul') last.lines!.push(trimmed.replace(/^[-*]\s+/, ''))
      else blocks.push({ kind: 'ul', lines: [trimmed.replace(/^[-*]\s+/, '')] })
      continue
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'ol') last.lines!.push(trimmed.replace(/^\d+[.)]\s+/, ''))
      else blocks.push({ kind: 'ol', lines: [trimmed.replace(/^\d+[.)]\s+/, '')] })
      continue
    }
    if (/^>\s?/.test(trimmed)) {
      flushParagraph()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'quote') last.lines!.push(trimmed.replace(/^>\s?/, ''))
      else blocks.push({ kind: 'quote', lines: [trimmed.replace(/^>\s?/, '')] })
      continue
    }
    paragraph.push(trimmed)
  }
  flushParagraph()
  return blocks
}

// Inline markdown: **bold**, [text](href) and `code`. Text is rendered as
// React nodes - the URL scheme is whitelisted so a hand-edited file cannot
// inject javascript: links.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      const label = linkMatch?.[1] ?? token
      const href = linkMatch?.[2] ?? '#'
      const safe = /^(https?:\/\/|\/|#|mailto:)/i.test(href)
      nodes.push(
        safe ? (
          <a key={key} href={href} className="text-primary underline underline-offset-2 hover:opacity-80">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      )
    } else {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// The legal pages' content, as React elements. Headings get stable ids so
// the pages can grow tables of contents later without rework.
export function renderMarkdown(source: string): ReactNode[] {
  return parseBlocks(source).map((block, index) => {
    const key = `b${index}`
    switch (block.kind) {
      case 'h1':
        return (
          <h1 key={key} className="font-display mt-10 mb-4 text-3xl font-semibold tracking-tight first:mt-0">
            {block.text}
          </h1>
        )
      case 'h2':
        return (
          <h2 key={key} className="font-display mt-8 mb-3 text-2xl font-semibold tracking-tight">
            {block.text}
          </h2>
        )
      case 'h3':
        return (
          <h3 key={key} className="mt-6 mb-2 text-lg font-semibold">
            {block.text}
          </h3>
        )
      case 'ul':
        return (
          <ul key={key} className="mb-4 list-disc space-y-1.5 pl-6">
            {block.lines!.map((line, j) => (
              <li key={`${key}-${j}`}>{renderInline(line, `${key}-${j}`)}</li>
            ))}
          </ul>
        )
      case 'ol':
        return (
          <ol key={key} className="mb-4 list-decimal space-y-1.5 pl-6">
            {block.lines!.map((line, j) => (
              <li key={`${key}-${j}`}>{renderInline(line, `${key}-${j}`)}</li>
            ))}
          </ol>
        )
      case 'quote':
        return (
          <blockquote key={key} className="mb-4 border-l-4 border-primary/40 bg-muted/50 px-4 py-2 text-muted-foreground italic">
            {block.lines!.map((line, j) => (
              <p key={`${key}-${j}`}>{renderInline(line, `${key}-${j}`)}</p>
            ))}
          </blockquote>
        )
      case 'hr':
        return <hr key={key} className="my-6 border-border" />
      default:
        return (
          <p key={key} className="mb-4 leading-relaxed">
            {renderInline(block.text ?? '', key)}
          </p>
        )
    }
  })
}
