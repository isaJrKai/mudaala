/**
 * Mudaala — one-off migration: push existing local photos to the bucket.
 *
 * When a deployment switches from local-disk storage to S3-compatible storage
 * (STORAGE_* env), the photos that already live in public/uploads/ must follow.
 * This script:
 *   1. uploads every REAL USER photo in public/uploads/ to the bucket under
 *      photos/<name> — PLACEHOLDER RULE: the seed folder is never uploaded,
 *      and never rewritten to a bucket URL (seed rows and legacy rows still
 *      referencing /uploads/seed/ are skipped and reported),
 *   2. optionally (--rewrite) rewrites the URLs stored in the database
 *      (listing photos arrays + business profile photos) from /uploads/<name>
 *      to the bucket's public URL, so every existing listing keeps working.
 *
 *   Launch sequence: run scripts/remove-seed-data.ts BEFORE any production
 *   data copy or this migration, so fixtures are already gone.
 *
 *   STORAGE_* env must be set (the bucket the photos move to), e.g.
 *   bun scripts/migrate-uploads-to-s3.ts            # upload only
 *   bun scripts/migrate-uploads-to-s3.ts --rewrite  # upload + rewrite DB urls
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { readStorageEnv, S3Storage } from '../src/lib/storage'

const REWRITE = process.argv.includes('--rewrite')
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

async function main() {
  const env = readStorageEnv()
  if (!env) {
    console.error('Refusing to run: STORAGE_ENDPOINT/BUCKET/KEY/SECRET must be set.')
    process.exit(1)
  }
  const storage = new S3Storage(env)
  const db = new PrismaClient()

  const files = (await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])).filter(
    // PLACEHOLDER RULE — seed photos are development fixtures: they are
    // never migrated to cloud storage and never rewritten to bucket URLs.
    // Removing seed data deletes the whole public/uploads/seed/ folder.
    (name) => name !== 'seed',
  )
  console.log(`${files.length} local photo(s) found in public/uploads (seed photos excluded)`)

  let uploaded = 0
  const contentType = (name: string) =>
    name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : 'image/webp'
  for (const name of files) {
    const data = await fs.readFile(path.join(UPLOAD_DIR, name)).catch(() => null)
    if (!data) continue
    await storage.put(`photos/${name}`, data, contentType(name))
    uploaded++
  }
  console.log(`${uploaded} photo(s) uploaded to the bucket`)

  if (REWRITE) {
    const base = (env.publicUrl ?? `${env.endpoint}/${env.bucket}`).replace(/\/$/, '')
    // PLACEHOLDER RULE — a seed photo path must never become a bucket URL:
    // the upload sweep above never uploaded seed files, so rewriting such a
    // reference would point at a photo that does not exist in the bucket.
    // This second guard keeps any seed path untouched even if the row-level
    // skips below ever miss one.
    const SEED_PATH = '/uploads/seed/'
    const mapUrl = (url: string) => {
      const m = /^\/uploads\/(.+)$/.exec(url)
      if (!m) return url
      if (m[1].startsWith('seed/')) return url
      return `${base}/photos/${m[1]}`
    }
    let touched = 0
    let skippedSeed = 0
    // Every row referencing a local upload — flagged seed rows are skipped
    // here (not filtered out silently), and so are LEGACY rows that predate
    // the isSeed flag but still point into /uploads/seed/. Remove-seed-data
    // deletes those before any production copy; until then they must never
    // be rewritten to the bucket.
    const listings = await db.listing.findMany({
      where: { photos: { contains: '/uploads/' } },
    })
    for (const l of listings) {
      let photos: string[] = []
      try {
        photos = JSON.parse(l.photos) as string[]
      } catch {
        continue
      }
      if (l.isSeed || photos.some((p) => typeof p === 'string' && p.includes(SEED_PATH))) {
        skippedSeed++
        continue
      }
      const next = JSON.stringify(photos.map(mapUrl))
      if (next !== l.photos) {
        await db.listing.update({ where: { id: l.id }, data: { photos: next } })
        touched++
      }
    }
    const profiles = await db.businessProfile.findMany({
      where: { photoUrl: { contains: '/uploads/' } },
    })
    for (const p of profiles) {
      if (!p.photoUrl) continue
      if (p.isSeed || p.photoUrl.includes(SEED_PATH)) {
        skippedSeed++
        continue
      }
      const next = mapUrl(p.photoUrl)
      if (next !== p.photoUrl) {
        await db.businessProfile.update({ where: { id: p.id }, data: { photoUrl: next } })
        touched++
      }
    }
    console.log(`${touched} database row(s) rewritten to the bucket's public URL`)
    console.log(`${skippedSeed} seed row(s) left untouched (PLACEHOLDER RULE — never migrated, never rewritten)`)
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error('Photo migration failed:', e)
  process.exit(1)
})
