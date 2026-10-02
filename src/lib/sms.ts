// Mudaala — SMS delivery behind a provider interface.
//
// Production talks to Africa's Talking (env: AT_API_KEY, AT_USERNAME,
// AT_SENDER_ID). Every other environment simulates delivery to the server
// console — no third-party account needed to develop or test.
//
// RED LINES (whole task package): phone numbers and verification codes are
// NEVER logged — not on success, not on failure, not by the console provider.
// Failure logs carry the provider name and a status/count only, so on-call
// learns that delivery broke without learning anything about any recipient.

export interface SmsProvider {
  send(to: string, message: string): Promise<void>
}

/** Show the shape of a number without showing the number. */
function maskRecipient(to: string): string {
  const digits = to.replace(/\D/g, '')
  return `+${digits.slice(0, 3) || '•••'}•••••••`
}

/** Non-production provider: delivery is simulated, nothing sensitive printed. */
export class ConsoleSmsProvider implements SmsProvider {
  async send(to: string, message: string): Promise<void> {
    console.log(
      `[sms:console] delivery simulated for ${maskRecipient(to)} — message ${message.length} chars (body never logged)`,
    )
  }
}

/** Production provider: Africa's Talking messaging API. */
export class AfricasTalkingSmsProvider implements SmsProvider {
  async send(to: string, message: string): Promise<void> {
    const username = process.env.AT_USERNAME
    const apiKey = process.env.AT_API_KEY
    const senderId = process.env.AT_SENDER_ID
    if (!username || !apiKey) {
      throw new Error("SMS is not configured — set AT_USERNAME and AT_API_KEY (Africa's Talking)")
    }
    const body = new URLSearchParams({ username, to, message })
    if (senderId) body.set('from', senderId)
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      // A hung gateway must not hold the reset request forever.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // Status only — response bodies can echo recipient details, so they
      // are never included in the error.
      throw new Error(`gateway responded HTTP ${res.status}`)
    }
    const data: unknown = await res.json().catch(() => null)
    const recipients = (data as { SMSMessageData?: { Recipients?: Array<{ status?: string }> } } | null)
      ?.SMSMessageData?.Recipients
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('gateway accepted the request but returned no recipients')
    }
    const rejected = recipients.filter((r) => String(r?.status ?? '').toLowerCase() !== 'success').length
    if (rejected > 0) {
      throw new Error(`gateway rejected ${rejected} of ${recipients.length} recipient(s)`)
    }
  }
}

export function getSmsProvider(): SmsProvider {
  return process.env.NODE_ENV === 'production' ? new AfricasTalkingSmsProvider() : new ConsoleSmsProvider()
}

/**
 * Fire the message through the active provider. Delivery problems NEVER throw
 * to the caller — a broken SMS gateway must not turn into a 500 for the user,
 * and in production it must not stay silent either: the failure is logged
 * here, without the phone number, the code, or any gateway body.
 */
export async function sendSmsBestEffort(to: string, message: string): Promise<void> {
  const provider = getSmsProvider()
  try {
    await provider.send(to, message)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error'
    console.error(`[sms] delivery FAILED via ${provider.constructor.name}: ${detail} — message not delivered`)
  }
}
