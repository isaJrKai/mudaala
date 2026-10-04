/**
 * Mudaala - one-off migration: copy the SQLite-era data into PostgreSQL.
 *
 * Run ONCE, after `prisma migrate deploy` has created the PostgreSQL schema:
 *
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts
 *   # or point at the old file explicitly:
 *   SQLITE_FILE=./db/custom.db npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Reads the old SQLite file directly (node:sqlite - no Prisma provider
 * juggling) and upserts every table into PostgreSQL through the current
 * Prisma client, preserving ids, timestamps and relations. Password hashes,
 * shop codes, report state, audit entries and app settings all survive the
 * move; the old precomputed search column (a SQLite workaround) is
 * deliberately dropped - PostgreSQL searches the real columns with ILIKE.
 *
 * Idempotent by construction: rows are upserted by their key, so a re-run
 * fixes nothing and breaks nothing.
 */
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'

const SQLITE_FILE = process.env.SQLITE_FILE ?? './db/custom.db'
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
  console.error('Refusing to run: DATABASE_URL must point at the new PostgreSQL database.')
  process.exit(1)
}

const sqlite = new DatabaseSync(SQLITE_FILE, { readOnly: true })
const pg = new PrismaClient()

const asDate = (v: any): Date | null => (v === null || v === undefined ? null : new Date(v))

function rows(table: string): Record<string, any>[] {
  try {
    const raw = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, any>[]
    // SQLite stored every DateTime as an integer millisecond count and every
    // Boolean as 0/1; Prisma wants real Date/Boolean values on the way in.
    const BOOLEAN_COLUMNS = new Set(['verified', 'priceNegotiable', 'read'])
    for (const row of raw) {
      for (const [col, val] of Object.entries(row)) {
        if (col.endsWith('At') && typeof val === 'number') row[col] = asDate(val)
        else if (BOOLEAN_COLUMNS.has(col) && typeof val === 'number') row[col] = val !== 0
      }
    }
    return raw
  } catch {
    console.warn(`  (table ${table} not present in the SQLite file - skipping)`)
    return []
  }
}

async function main() {
  const counts: Record<string, { sqlite: number; postgres: number }> = {}
  const note = (table: string, sqliteCount: number, postgresCount: number) => {
    counts[table] = { sqlite: sqliteCount, postgres: postgresCount }
  }

  // 1. Users - everything else hangs off these.
  const users = rows('User')
  for (const u of users) {
    delete u.searchText // SQLite-era search workaround - dropped on purpose
    await pg.user.upsert({
      where: { id: u.id },
      create: { ...u, createdAt: asDate(u.createdAt) ?? new Date(), updatedAt: asDate(u.updatedAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('User', users.length, await pg.user.count())

  // 2. Sessions + password resets (both carry the user's security state).
  const sessions = rows('Session')
  for (const s of sessions) {
    await pg.session.upsert({
      where: { id: s.id },
      create: { ...s, expiresAt: asDate(s.expiresAt) ?? new Date(), createdAt: asDate(s.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('Session', sessions.length, await pg.session.count())

  const resets = rows('PasswordReset')
  for (const r of resets) {
    await pg.passwordReset.upsert({
      where: { id: r.id },
      create: {
        ...r,
        expiresAt: asDate(r.expiresAt) ?? new Date(),
        usedAt: asDate(r.usedAt),
        createdAt: asDate(r.createdAt) ?? new Date(),
      } as any,
      update: {},
    })
  }
  note('PasswordReset', resets.length, await pg.passwordReset.count())

  // 3. Business profiles (unique on userId).
  const profiles = rows('BusinessProfile')
  for (const p of profiles) {
    await pg.businessProfile.upsert({
      where: { userId: p.userId },
      create: { ...p, createdAt: asDate(p.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('BusinessProfile', profiles.length, await pg.businessProfile.count())

  // 4. Listings.
  const listings = rows('Listing')
  for (const l of listings) {
    delete l.searchText // SQLite-era search workaround - dropped on purpose
    await pg.listing.upsert({
      where: { id: l.id },
      create: { ...l, createdAt: asDate(l.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('Listing', listings.length, await pg.listing.count())

  // 5. Saved searches + notifications.
  const searches = rows('SavedSearch')
  for (const s of searches) {
    await pg.savedSearch.upsert({
      where: { id: s.id },
      create: { ...s, createdAt: asDate(s.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('SavedSearch', searches.length, await pg.savedSearch.count())

  const notifications = rows('Notification')
  for (const n of notifications) {
    await pg.notification.upsert({
      where: { id: n.id },
      create: { ...n, createdAt: asDate(n.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('Notification', notifications.length, await pg.notification.count())

  // 6. Moderation + platform tables.
  const reports = rows('Report')
  for (const r of reports) {
    await pg.report.upsert({
      where: { id: r.id },
      create: { ...r, createdAt: asDate(r.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('Report', reports.length, await pg.report.count())

  const audit = rows('AuditLog')
  for (const a of audit) {
    await pg.auditLog.upsert({
      where: { id: a.id },
      create: { ...a, createdAt: asDate(a.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('AuditLog', audit.length, await pg.auditLog.count())

  const settings = rows('AppSetting')
  for (const s of settings) {
    await pg.appSetting.upsert({
      where: { key: s.key },
      create: { ...s, updatedAt: asDate(s.updatedAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('AppSetting', settings.length, await pg.appSetting.count())

  const snapshots = rows('PriceSnapshot')
  for (const s of snapshots) {
    await pg.priceSnapshot.upsert({
      where: { id: s.id },
      create: { ...s, createdAt: asDate(s.createdAt) ?? new Date() } as any,
      update: {},
    })
  }
  note('PriceSnapshot', snapshots.length, await pg.priceSnapshot.count())

  console.log('\nMigration report (sqlite → postgres):')
  let mismatch = false
  for (const [table, c] of Object.entries(counts)) {
    const ok = c.sqlite === c.postgres
    if (!ok) mismatch = true
    console.log(`  ${ok ? '✓' : '✗'} ${table}: ${c.sqlite} → ${c.postgres}`)
  }
  if (mismatch) {
    console.error('Row counts do not match - investigate before switching traffic.')
    process.exitCode = 1
  } else {
    console.log('All tables copied cleanly.')
  }
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    sqlite.close()
    await pg.$disconnect()
  })
