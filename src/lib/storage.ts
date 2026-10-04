// Mudaala - photo storage behind one interface.
//
// Development writes photos to the local disk (public/uploads, served
// statically by Next). Production points at any S3-compatible bucket -
// Cloudflare R2, Supabase Storage, MinIO - using the STORAGE_* environment
// variables. Call sites (today: the upload route; the URL-migration script)
// never know which one is behind the interface, and the choice is made per
// process from the environment, so flipping a deployment from disk to bucket
// needs no code change.
//
// The S3 provider is deliberately dependency-free: one PUT per object,
// signed with AWS SigV4 by hand (the same node:crypto the app already uses).
// Path-style URLs (endpoint/bucket/key) work with R2, Supabase's S3 gateway
// and MinIO alike.

import { createHash, createHmac } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export interface PhotoStorage {
  /** Human-readable provider name for logs and health reporting. */
  readonly name: string
  /** Persist one re-encoded photo; resolves with its PUBLIC url. */
  save(data: Buffer, extension: string): Promise<string>
  /** Delete one stored photo by its public URL. A URL this provider does not
   *  own resolves quietly; an already-deleted object too - deletion is
   *  idempotent because account deletion must never fail on a missing file. */
  remove(url: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Local disk (development default)
// ---------------------------------------------------------------------------

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

export class LocalDiskStorage implements PhotoStorage {
  readonly name = 'local-disk'

  async save(data: Buffer, extension: string): Promise<string> {
    const name = `${randomBytes(4).toString('hex')}-${randomBytes(8).toString('hex')}.${extension}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, name), data)
    return `/uploads/${name}`
  }

  async remove(url: string): Promise<void> {
    // Only bare filenames inside UPLOAD_DIR are ours - anything with a path
    // separator or traversal is not a file this provider wrote, so it is
    // ignored rather than chased.
    const name = url.split('/').pop() ?? ''
    if (!name || name.includes('..') || name.includes('/') || !url.startsWith('/uploads/')) return
    await fs.rm(path.join(UPLOAD_DIR, name), { force: true })
  }
}

// ---------------------------------------------------------------------------
// S3-compatible (Cloudflare R2, Supabase Storage, MinIO, AWS itself)
// ---------------------------------------------------------------------------

export interface S3Env {
  endpoint: string // e.g. https://<account>.r2.cloudflarestorage.com or a Supabase S3 URL
  bucket: string
  key: string
  secret: string
  publicUrl?: string // where saved objects are publicly served, e.g. https://cdn.example
  region?: string // R2/Supabase use "auto" when absent
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

/** AWS SigV4 canonical signature for one request - exported for unit tests. */
export function signS3Request(
  env: S3Env,
  method: 'PUT' | 'DELETE',
  objectKey: string,
  payloadHash: string,
  now = new Date(),
): { authorization: string; amzDate: string; payloadHash: string; host: string; path: string } {
  const host = new URL(env.endpoint).host
  const region = env.region ?? 'auto'
  const service = 's3'
  const amzDate = `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}` // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)
  // SigV4 signs the RFC3986-encoded URI path. Keep `/` separators but encode
  // each path segment so the canonical request is identical to what fetch sends.
  const encodePathSegment = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  const path = `/${encodePathSegment(env.bucket)}/${objectKey.split('/').map(encodePathSegment).join('/')}`

  const canonicalRequest = [
    method,
    path,
    '',
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
    'host;x-amz-content-sha256;x-amz-date',
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${env.secret}`, dateStamp), region), service), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${env.key}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`
  return { authorization, amzDate, payloadHash, host, path }
}

const EMPTY_PAYLOAD_HASH = createHash('sha256').update('').digest('hex')

/** AWS SigV4 canonical signature for one PUT - exported for unit tests. */
export function signS3Put(
  env: S3Env,
  objectKey: string,
  payload: Buffer,
  now = new Date(),
): { authorization: string; amzDate: string; payloadHash: string; host: string; path: string } {
  return signS3Request(env, 'PUT', objectKey, createHash('sha256').update(payload).digest('hex'), now)
}

export class S3Storage implements PhotoStorage {
  readonly name = 's3-compatible'
  constructor(private readonly env: S3Env) {}

  /** PUT one object; exported so the one-off URL-migration script reuses it. */
  async put(objectKey: string, data: Buffer, contentType = 'image/webp'): Promise<void> {
    const { authorization, amzDate, payloadHash, host, path } = signS3Put(this.env, objectKey, data)
    const res = await fetch(`${this.env.endpoint}${path}`, {
      method: 'PUT',
      headers: {
        authorization,
        host,
        'content-type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'content-length': String(data.byteLength),
      },
      body: new Uint8Array(data),
    })
    if (!res.ok) {
      // Keep the provider's diagnostic response in server logs. It is essential
      // for distinguishing bad credentials, region/signature errors, and bucket
      // permission failures while never returning the body to the browser.
      const detail = (await res.text()).replace(/[\\r\\n]+/g, ' ').slice(0, 500)
      console.error(`[photo-storage] Supabase S3 PUT rejected: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`)
      throw new Error(`S3 put failed with HTTP ${res.status}`)
    }
  }

  async save(data: Buffer, extension: string): Promise<string> {
    const key = `photos/${randomBytes(4).toString('hex')}-${randomBytes(8).toString('hex')}.${extension}`
    await this.put(key, data)
    return this.publicUrlFor(key)
  }

  async remove(url: string): Promise<void> {
    const key = this.objectKeyFor(url)
    if (!key) return
    const { authorization, amzDate, payloadHash, host, path } = signS3Request(this.env, 'DELETE', key, EMPTY_PAYLOAD_HASH)
    const res = await fetch(`${this.env.endpoint}${path}`, {
      method: 'DELETE',
      headers: { authorization, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate },
    })
    // 404 counts as deleted: removal is idempotent.
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 delete failed with HTTP ${res.status}`)
    }
  }

  /** The object key behind a public URL, or null when the URL is not ours. */
  objectKeyFor(url: string): string | null {
    const bases = [this.env.publicUrl, `${this.env.endpoint.replace(/\/$/, '')}/${this.env.bucket}`]
      .filter(Boolean)
      .map((b) => (b as string).replace(/\/$/, ''))
    for (const base of bases) {
      if (url.startsWith(`${base}/`)) return url.slice(base.length + 1)
    }
    return null
  }

  /** The public URL an object is served from (media host + key). */
  publicUrlFor(objectKey: string): string {
    const base = (this.env.publicUrl ?? `${this.env.endpoint.replace(/\/$/, '')}/${this.env.bucket}`).replace(/\/$/, '')
    return `${base}/${objectKey}`
  }
}

// ---------------------------------------------------------------------------
// Provider choice - pure function so the suite can pin it
// ---------------------------------------------------------------------------

export function readStorageEnv(env: Record<string, string | undefined> = process.env): S3Env | null {
  const endpoint = env.STORAGE_ENDPOINT?.trim()
  const bucket = env.STORAGE_BUCKET?.trim()
  const key = env.STORAGE_KEY?.trim()
  const secret = env.STORAGE_SECRET?.trim()
  if (!endpoint || !bucket || !key || !secret) return null
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    bucket,
    key,
    secret,
    publicUrl: env.STORAGE_PUBLIC_URL?.trim() || undefined,
    region: env.STORAGE_REGION?.trim() || undefined,
  }
}

export function chooseStorage(env: Record<string, string | undefined> = process.env): PhotoStorage {
  const s3 = readStorageEnv(env)
  return s3 ? new S3Storage(s3) : new LocalDiskStorage()
}
