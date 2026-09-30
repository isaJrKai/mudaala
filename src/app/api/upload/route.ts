// Photo upload — real files, real limits. Used by listing photos and the shop
// photo. Rules that keep this honest and safe:
//   • Signed-in sellers only (uploading is a seller action).
//   • Type allowlist enforced by MAGIC BYTES, not the client's claimed MIME —
//     a renamed .exe must never land in uploads/.
//   • Hard size cap (8 MB covers phone-camera JPEGs on low-end devices).
//   • Random file names; the original name is never trusted.
// Files live in public/uploads and are served statically. In production this
// is the seam where an object store (S3/R2) would slot in.

import { NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { route, jsonOk, requireUser, ApiError } from '@/lib/api'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

// Magic-byte signatures — the only truth about what a file really is.
function sniffImageType(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length < 12) return null
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp'
  }
  return null
}

const EXTENSION = { jpeg: '.jpg', png: '.png', webp: '.webp' } as const

export async function POST(request: NextRequest) {
  return route(async () => {
    await requireUser('Sign in to upload photos')

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || !(file instanceof File)) {
      throw new ApiError(400, 'Choose a photo to upload')
    }
    if (file.size === 0) {
      throw new ApiError(400, 'That file is empty')
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, 'Photo is too large — maximum is 8 MB')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type) {
      throw new ApiError(400, 'Only JPG, PNG or WebP photos are allowed')
    }

    await mkdir(UPLOAD_DIR, { recursive: true })
    const name = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}${EXTENSION[type]}`
    await writeFile(path.join(UPLOAD_DIR, name), bytes)

    // Public path (Next serves /public at the root).
    return jsonOk({ url: `/uploads/${name}` }, 201)
  })
}
