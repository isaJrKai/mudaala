// Removes orphaned files from public/uploads (files no listing or shop photo
// references). Seed files under public/uploads/seed/ are never touched.
import { PrismaClient } from '@prisma/client'
import * as fs from 'node:fs'
import * as path from 'node:path'

const db = new PrismaClient()

async function main() {
  const listings = await db.listing.findMany({ select: { photos: true } })
  const shops = await db.businessProfile.findMany({ select: { photoUrl: true } })
  const referenced = new Set<string>()
  for (const l of listings) for (const p of (l.photos ?? []) as string[]) referenced.add(p.replace('/uploads/', ''))
  for (const s of shops) if (s.photoUrl) referenced.add(s.photoUrl.replace('/uploads/', ''))

  const dir = 'public/uploads'
  let removed = 0
  let kept = 0
  for (const f of fs.readdirSync(dir)) {
    const rel = path.join(dir, f)
    if (!fs.statSync(rel).isFile()) continue
    if (referenced.has(f)) {
      kept++
      continue
    }
    fs.unlinkSync(rel)
    removed++
  }
  console.log(`removed ${removed} orphan uploads; kept ${kept} referenced files`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
