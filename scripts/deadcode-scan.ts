// Dead code scanner: cross-file usage analysis for exports and whole files.
// Reports (1) exported symbols never referenced from any OTHER file,
// (2) whole files never imported anywhere, (3) debug/console leftovers, TODO markers.
// Usage: npx tsx scripts/deadcode-scan.ts
import fs from 'fs'
import path from 'path'

const ROOTS = ['src']
const USAGE_ROOTS = ['src', 'scripts', 'tests']
const EXTS = ['.ts', '.tsx']

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      walk(p, acc)
    } else if (EXTS.includes(path.extname(e.name))) acc.push(p)
  }
  return acc
}

const srcFiles = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []))
const usageFiles = USAGE_ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []))
const contents = new Map<string, string>()
for (const f of usageFiles) contents.set(f, fs.readFileSync(f, 'utf8'))

// 1. collect exported symbols per file
type Exp = { file: string; name: string; kind: string }
const exports: Exp[] = []
const exportRe =
  /export\s+(?:async\s+)?(function|const|class|type|interface|enum)\s+([A-Za-z0-9_]+)/g
const listRe = /export\s*\{([^}]+)\}/g
for (const f of srcFiles) {
  const src = contents.get(f)!
  let m: RegExpExecArray | null
  while ((m = exportRe.exec(src))) exports.push({ file: f, name: m[2], kind: m[1] })
  while ((m = listRe.exec(src))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && /^[A-Za-z0-9_]+$/.test(name)) {
        exports.push({ file: f, name, kind: 'listed' })
      }
    }
  }
}

// 2. count cross-file usages (word match outside declaring file)
const usages = new Map<string, number>() // key: file::name
for (const { file, name } of exports) {
  const re = new RegExp(`\\b${name}\\b`)
  let count = 0
  for (const [g, src] of contents) {
    if (g === file) continue
    if (re.test(src)) count++
  }
  usages.set(`${file}::${name}`, count)
}

console.log('== EXPORTED SYMBOLS WITH ZERO CROSS-FILE REFERENCES ==')
const deadByFile = new Map<string, string[]>()
for (const { file, name, kind } of exports) {
  if (usages.get(`${file}::${name}`) === 0) {
    if (!deadByFile.has(file)) deadByFile.set(file, [])
    deadByFile.get(file)!.push(`${name} (${kind})`)
  }
}
for (const [f, names] of [...deadByFile.entries()].sort()) {
  console.log(`${f}`)
  for (const n of names) console.log(`   ${n}`)
}

// 3. whole files never referenced (basename not appearing in any other file)
console.log('\n== FILES NEVER IMPORTED/REFERENCED ELSEWHERE ==')
for (const f of srcFiles) {
  const base = path.basename(f).replace(/\.(ts|tsx)$/, '')
  if (base === 'route' || base === 'page' || base === 'layout') continue // app router entries
  let referenced = false
  for (const [g, src] of contents) {
    if (g === f) continue
    if (new RegExp(`\\b${base}\\b`).test(src)) {
      referenced = true
      break
    }
  }
  if (!referenced) console.log(f)
}

// 4. debug leftovers + markers in src/
console.log('\n== DEBUG LEFTOVERS / MARKERS ==')
for (const [f, src] of contents) {
  if (!f.startsWith('src')) continue
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (/console\.(log|debug|info)\(/.test(line)) console.log(`${f}:${i + 1} ${line.trim().slice(0, 90)}`)
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) console.log(`${f}:${i + 1} MARKER ${line.trim().slice(0, 90)}`)
  })
}
