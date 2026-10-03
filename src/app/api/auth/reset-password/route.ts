// Mudaala - step 2 of password reset: code + new password.
//
// EVERY failure mode below returns the same message - unknown phone, no code
// ever issued, expired code, already-used code, killed code, wrong code -
// because distinguishing them would tell an attacker which of their guesses
// got warmer. One generic sentence, every time.
//
// A code dies after 5 wrong submissions. Guessing a 6-digit code therefore
// buys at most 5 tries in 10 minutes, then the door shuts.
//
// On success: the new password must pass the SAME rulebook as registration
// (min 8, not common, not the phone number), every session for the user is
// deleted (a stolen session does not survive a password change), the used
// code is marked consumed, and any login lockout on the phone is cleared so
// the user can actually sign in with their new password.

import { db } from '@/lib/db'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { resetPasswordSchema, phoneCandidates, passwordProblem } from '@/lib/validation'
import { hashPassword } from '@/lib/auth'
import { resetCodeMatches } from '@/lib/sms'
import { clear } from '@/lib/rate-limit'

const GENERIC_FAIL = 'That code did not work or has expired. Request a new code and try again.'

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, resetPasswordSchema)
    const candidates = phoneCandidates(data.phone)
    const user = candidates.length
      ? await db.user.findFirst({ where: { phone: { in: candidates } } })
      : null

    // Same generic answer when the account does not exist - no enumeration.
    if (!user) return jsonError(400, GENERIC_FAIL)

    const reset = await db.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!reset) return jsonError(400, GENERIC_FAIL)

    if (!resetCodeMatches(data.code, reset.codeHash)) {
      const attempts = reset.attempts + 1
      if (attempts >= 5) {
        // Five wrong tries: the code is dead, even if the right one arrives next.
        await db.passwordReset.update({ where: { id: reset.id }, data: { attempts, usedAt: new Date() } })
      } else {
        await db.passwordReset.update({ where: { id: reset.id }, data: { attempts } })
      }
      return jsonError(400, GENERIC_FAIL)
    }

    // Correct code - now the new password must earn its place.
    const pwProblem = passwordProblem(data.newPassword, user.phone)
    if (pwProblem) {
      // The code stays alive: fixing a weak password should not cost another SMS.
      return jsonError(400, pwProblem, { newPassword: pwProblem })
    }

    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(data.newPassword) } }),
      // A password change revokes EVERYWHERE - every device, every channel.
      db.session.deleteMany({ where: { userId: user.id } }),
      db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date(), attempts: reset.attempts } }),
      db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
    ])

    // Clear any stale failed-login lockout so the new password works right away.
    for (const phone of candidates) await clear(`login:fail:${phone}`)

    return jsonOk({ ok: true, message: 'Password updated. Sign in with your new password.' })
  })
}
// Note: the old password is never compared here - the SMS code IS the proof
// of identity, and a user who forgot their password cannot repeat it.
