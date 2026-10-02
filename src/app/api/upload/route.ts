// Photo upload — the ONLY way images enter Mudaala.
// requireUser: uploads are a seller action, buyers never need this.
// Trust is decided by magic bytes, never by the filename a client claims —
// "evil.png" that is really text (or worse) is rejected before it is decoded.
// Every accepted image is then re-encoded through sharp: EXIF-rotated,
// fitted inside 1200×1200, and written as WebP — a market photo lands
// small enough for a data bundle, and no payload survives as-is.
// Files land in public/uploads/ with random names, so nothing user-controlled
// ever becomes a URL path segment. Served statically by Next (public/).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ApiError, route, jsonOk, requireUser } from '@/lib/api'
import { hit, UPLOAD_HOUR_MAX, UPLOAD_WINDOW_MS } from '@/lib/rate-limit'
import sharp from 'sharp'

const MAX_BYTES = 8 * 1024 * 1024 // 8MB pre-compression — phones shoot big
const MAX_EDGE = 1200 // the largest edge a stored photo may have
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

// Read the first bytes and say what the file REALLY is, if anything we accept.
function sniffImage(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return 'png'
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // "WEBP"
  ) return 'webp'
  return null
}

// Random public name — same shape as the existing seed files. Everything is
// stored as .webp because the pipeline re-encodes every accepted image.
function randomName(): string {
  return `${randomBytes(4).toString('hex')}-${randomBytes(8).toString('hex')}.webp`
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser('Sign in to upload photos')

    // 30 photos per user per hour: a whole catalogue shoot in a sitting is
    // fine; bulk-filling the disk is not.
    const verdict = hit(`upload:user:${user.id}`, UPLOAD_HOUR_MAX, UPLOAD_WINDOW_MS)
    if (!verdict.ok) {
      throw new ApiError(429, 'That is a lot of photos — please wait a while before uploading more')
    }

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiError(400, 'Choose a photo to upload')
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, 'That photo is too large — 8MB is the limit')
    }

    // Magic bytes, not the filename, decide acceptance.
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (!sniffImage(head)) {
      throw new ApiError(400, 'That file is not a JPEG, PNG or WebP image')
    }

    // Re-encode before saving: EXIF rotation honoured, fitted inside a
    // 1200×1200 box (never enlarged), WebP for weight. If decoding fails the
    // file lies about what it is — reject it honestly.
    const input = Buffer.from(await file.arrayBuffer())
    let output: Buffer
    try {
      output = await sharp(input)
        .rotate()
        .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
    } catch {
      throw new ApiError(400, 'That image could not be processed — try another photo')
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const name = randomName()
    await fs.writeFile(path.join(UPLOAD_DIR, name), output)

    return jsonOk({ url: `/uploads/${name}` }, 201)
  })
}
