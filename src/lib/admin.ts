// Mudaala — admin gate for deployment-level settings.
// Most settings belong to each shop; a few (like the PostgreSQL deployment
// connection) belong to the DEPLOYMENT as a whole. Those are gated to a small
// explicit allowlist: ADMIN_PHONES, a comma-separated list of phone numbers in
// any accepted dial format ("+254712000001", "0712000001"). Everyone else —
// signed in or not — gets 403.

import { ApiError, requireUser } from './api'
import { phoneCandidates } from './validation'
import type { User } from '@prisma/client'

/** Every accepted form of every admin phone in ADMIN_PHONES. Empty env → no
 *  admins at all (fail closed: the route is unusable rather than open). */
function adminPhoneSets(): string[][] {
  const raw = process.env.ADMIN_PHONES ?? ''
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => phoneCandidates(entry))
}

export function isAdminPhone(phone: string): boolean {
  return adminPhoneSets().some((candidates) => candidates.includes(phone))
}

export async function requireAdmin(message = 'Only the shop admin can change deployment settings'): Promise<User> {
  const user = await requireUser('Sign in to view deployment settings')
  if (!isAdminPhone(user.phone)) throw new ApiError(403, message)
  return user
}
