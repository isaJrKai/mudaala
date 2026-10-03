// Mudaala - SMS delivery behind a swappable provider.
//
// Password-reset codes travel by SMS. Which provider actually carries them is
// an environment decision, not a code decision:
//
//   production      → Africa's Talking (AT_API_KEY + AT_USERNAME, sender ID
//                     from AT_SENDER_ID). A FAILED send is logged ONCE, with
//                     NO phone number and NO code - a log line must never
//                     become a side channel for secrets. Never silent.
//   development     → the console provider "delivers" the message to the dev
//                     server console. That printout IS the developer's inbox
//                     (there is no SIM card in a dev box). It never runs in
//                     production, so the codes it prints are dev-only codes
//                     for dev-only accounts.
//
// Adding a provider (Twilio, MTN Uganda, …) means adding one class here and
// one branch in chooseSmsProvider() - call sites do not change.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export interface SmsProvider {
  readonly name: string
  send(to: string, message: string): Promise<void>
}

// Africa's Talking REST API (no SDK dependency). Their error bodies echo the
// recipient, so on failure we throw a status-only error - the body never
// reaches a log or a response.
class AfricasTalkingProvider implements SmsProvider {
  readonly name = 'africas-talking'

  async send(to: string, message: string): Promise<void> {
    const apiKey = process.env.AT_API_KEY
    const username = process.env.AT_USERNAME
    const senderId = process.env.AT_SENDER_ID
    if (!apiKey || !username) {
      throw new Error('SMS provider is not configured')
    }

    const form = new URLSearchParams({ username, to, message })
    if (senderId) form.set('from', senderId)

    let status = 0
    try {
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      })
      status = res.status
      if (!res.ok) throw new Error(`provider status ${status}`)
    } catch (err) {
      // Re-throw status errors as-is; wrap network errors without any payload.
      if (err instanceof Error && err.message.startsWith('provider status')) throw err
      throw new Error('provider unreachable')
    }
  }
}

// Dev-only "delivery": the server console is the inbox. Development uses this
// even when AT_* variables exist - a stray real SMS during testing is worse
// than a console line.
class ConsoleProvider implements SmsProvider {
  readonly name = 'console'

  async send(to: string, message: string): Promise<void> {
    console.log(`[sms:${this.name}] to ${to}: ${message}`)
  }
}

export function chooseSmsProvider(): SmsProvider {
  // Explicit override first: a staging/self-test/preview deployment runs with
  // NODE_ENV=production but without real SMS credentials - its reset codes
  // must land in the inspectable console inbox, not die inside a provider
  // that was never configured. Dev and production defaults stay untouched.
  if (process.env.SMS_PROVIDER === 'console') return new ConsoleProvider()
  if (process.env.NODE_ENV === 'production') return new AfricasTalkingProvider()
  return new ConsoleProvider()
}

// ---- Reset codes: generation, hashing and comparison ----
// A 6-digit code is small, so its security comes from the server-side 5-wrong-
// tries kill switch and the 10-minute expiry - NOT from the hash. sha256 is
// enough to keep a database leak from handing over live codes.

export function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashResetCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

export function resetCodeMatches(code: string, codeHash: string): boolean {
  const candidate = Buffer.from(hashResetCode(code), 'hex')
  const expected = Buffer.from(codeHash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}
