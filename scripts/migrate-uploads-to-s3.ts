/**
 * Mudaala — one-off migration: push existing local photos to the bucket.
 *
 * When a deployment switches from local-disk storage to S3-compatible storage
 * (STORAGE_* env), the photos that already live in public/uploads/ must follow.
 * This script:
 *   1. uploads every file in public/uploads/ to the bucket under photos/<name>,
 *   2. optionally (--rewrite) rewrites the URLs stored in the database
 *      (listing photos arrays + business profile photos) from /uploads/<name>
 *      to the bucket's public URL, so every existing listing keeps working.
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

  const files = await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])
  console.log(`${files.length} local photo(s) found in public/uploads`)

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
    const mapUrl = (url: string) => {
      const m = /^\/uploads\/(.+)$/.exec(url)
      return m ? `${base}/photos/${m[1]}` : url
    }
    let touched = 0
    const listings = await db.listing.findMany({ where: { photos: { contains: '/uploads/' } } })
    for (const l of listings) {
      let photos: string[] = []
      try {
        photos = JSON.parse(l.photos) as string[]
      } catch {
        continue
      }
      const next = JSON.stringify(photos.map(mapUrl))
      if (next !== l.photos) {
        await db.listing.update({ where: { id: l.id }, data: { photos: next } })
        touched++
      }
    }
    const profiles = await db.businessProfile.findMany({ where: { photoUrl: { contains: '/uploads/' } } })
    for (const p of profiles) {
      if (!p.photoUrl) continue
      await db.businessProfile.update({ where: { id: p.id }, data: { photoUrl: mapUrl(p.photoUrl) } })
      touched++
    }
    console.log(`${touched} database row(s) rewritten to the bucket's public URL`)
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error('Photo migration failed:', e)
  process.exit(1)
})
