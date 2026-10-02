// Mudaala — step 2 of password reset: code + new password.
//
// Every failure that is not a validation problem answers with ONE message —
// unknown phone, no pending code, expired code, already-used code, dead
// (5 wrong tries) and wrong code are indistinguishable from the outside.
// Password rules are the register rules (shared schema): min 8, not common,
// not the account's phone number.
//
// On success the password flips in one transaction and EVERY session for the
// user is revoked — the requester's stale cookie is cleared too.

import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { passwordResetConfirmSchema } from '@/lib/validation'
import { confirmPasswordReset } from '@/lib/password-reset'
import { clearSessionCookie } from '@/lib/auth'

const INVALID_MESSAGE = 'That code is not valid or has expired. Request a new code and try again.'

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, passwordResetConfirmSchema)

    const result = await confirmPasswordReset(data.phone, data.code, data.newPassword)
    if (result !== 'ok') {
      return jsonError(400, INVALID_MESSAGE)
    }

    // Sessions are already gone server-side; drop the dead cookie if one rode along.
    await clearSessionCookie()

    return jsonOk({ ok: true, message: 'Password updated. Sign in with your new password.' })
  })
}
