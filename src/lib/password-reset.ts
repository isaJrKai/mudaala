// Mudaala — password reset by SMS code: rules and data flow.
//
// Threat model shapes every choice here:
//  - The 6-digit code is stored ONLY as a salted hash (lib/password.ts).
//  - Requesting a code must not reveal whether a phone has an account: the
//    HTTP response is byte-identical either way (see the request route), the
//    phone rate budget is consumed for every valid-format phone whether or
//    not an account exists, and a missing account simply does nothing.
//  - Guessing is bounded: the code dies after 10 minutes, after 5 wrong
//    entries, and as soon as it is used. Only the LATEST open code for a
//    user is accepted — every new request invalidates earlier ones.
//  - A successful reset revokes EVERY session for that user (a stolen
//    session cannot survive a password change).

import { db } from '@/lib/db'
import { hashCode, verifyCode, generateCode, hashPassword } from '@/lib/password'
import { sendSmsBestEffort } from '@/lib/sms'
import { phoneCandidates } from '@/lib/validation'

export const RESET_CODE_TTL_MS = 10 * 60_000 // 10 minutes
export const MAX_WRONG_ATTEMPTS = 5

function userByPhone(rawPhone: string) {
  const candidates = phoneCandidates(rawPhone)
  if (candidates.length === 0) return null
  return db.user.findFirst({ where: { phone: { in: candidates } } })
}

/** Create a reset code for the phone IF an account exists; otherwise no-op.
 *  Either way the caller answers the client identically. */
export async function createPasswordReset(rawPhone: string): Promise<void> {
  const user = await userByPhone(rawPhone)
  if (!user) return

  const code = generateCode()
  // One live code per account: a fresh request silently retires older ones,
  // so "which of the three codes I requested still works?" is never a question.
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } })
  await db.passwordReset.create({
    data: {
      userId: user.id,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
    },
  })
  await sendSmsBestEffort(
    user.phone,
    `Your Mudaala password reset code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this message — your password is unchanged.`,
  )
}

export type ResetConfirmResult = 'ok' | 'invalid'

/** Verify phone + code + new password and swing the account over.
 *  'invalid' covers every failure with ONE answer — unknown phone, no pending
 *  code, expired, already used, exhausted attempts and wrong code all look
 *  exactly alike from the outside. */
export async function confirmPasswordReset(rawPhone: string, code: string, newPassword: string): Promise<ResetConfirmResult> {
  const user = await userByPhone(rawPhone)
  if (!user) return 'invalid'

  const row = await db.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) return 'invalid'
  if (row.expiresAt.getTime() < Date.now()) return 'invalid'
  if (row.attempts >= MAX_WRONG_ATTEMPTS) return 'invalid'

  if (!verifyCode(code, row.codeHash)) {
    await db.passwordReset.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return 'invalid'
  }

  // One transaction: the password flips, the code burns, leftover codes die,
  // and every session (cookie or Bearer) for this user is revoked.
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } }),
    db.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ])
  return 'ok'
}
