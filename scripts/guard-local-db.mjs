// Safety guard for destructive database commands (db:push, db:reset, db:seed).
// They are only allowed against a database on this computer. If DATABASE_URL
// points anywhere else (for example Supabase), the command stops here so real
// data cannot be wiped by accident. To override on purpose, set
// ALLOW_REMOTE_DB_WRITE=1 for that one command.
import fs from 'node:fs'

let url = process.env.DATABASE_URL || ''
if (!url && fs.existsSync('.env')) {
  const m = /^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m.exec(fs.readFileSync('.env', 'utf8'))
  if (m) url = m[1]
}

let host = ''
try {
  host = new URL(url).hostname
} catch {
  /* unreadable URL: treated as not local below */
}

const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
if (!local && process.env.ALLOW_REMOTE_DB_WRITE !== '1') {
  console.error('')
  console.error('STOPPED: this command can erase data, and DATABASE_URL does not point at this computer.')
  console.error(`  database host: ${host || '(not set)'}`)
  console.error('  Point DATABASE_URL at a local database to run it.')
  console.error('  If you really mean to run it on the remote database, set ALLOW_REMOTE_DB_WRITE=1 for this one command.')
  console.error('')
  process.exit(1)
}
