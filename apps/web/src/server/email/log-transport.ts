import "server-only"

import type { EmailTransport, OutgoingEmail, SendResult } from "./transport"

/**
 * The transport outside Production unless real sending is switched on
 * (DOS/Give#254): it mails nobody. It logs that an email would have gone
 * (kind of message, masked recipient) and reports success, so beta runs the
 * whole outbox without reaching real people.
 *
 * To exercise retries and dead rows on beta without a provider, two reserved
 * domains (RFC 2606 `.invalid`, never deliverable) fail on purpose:
 * `…@retry.invalid` fails every attempt as a temporary error (so the row
 * retries and ends dead after its last attempt) and `…@bounce.invalid` fails
 * permanently (dead at once).
 */

export const RETRY_TEST_DOMAIN = "retry.invalid"
export const BOUNCE_TEST_DOMAIN = "bounce.invalid"

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase()
}

function masked(address: string): string {
  const at = address.lastIndexOf("@")
  return at < 1 ? "•••" : `${address[0]}•••${address.slice(at)}`
}

export function createLogTransport(log: (line: string) => void = console.info): EmailTransport {
  return {
    async send(email: OutgoingEmail): Promise<SendResult> {
      const domain = domainOf(email.to)
      if (domain === RETRY_TEST_DOMAIN) {
        return { ok: false, permanent: false, error: "LOG: test temporary failure" }
      }
      if (domain === BOUNCE_TEST_DOMAIN) {
        return { ok: false, permanent: true, error: "LOG: test permanent failure" }
      }
      log(`email not sent (log transport): ${email.idempotencyKey} to ${masked(email.to)}`)
      return { ok: true, messageId: `log:${email.headers["Message-ID"] ?? email.idempotencyKey}` }
    },
  }
}

/**
 * Real sending to allowlisted recipients only, the log transport for everyone
 * else. Entries are full addresses or `@domain`, case-insensitive.
 */
export function allowlistTransport(
  allowlist: readonly string[],
  real: EmailTransport,
  fallback: EmailTransport
): EmailTransport {
  const entries = allowlist.map((e) => e.trim().toLowerCase()).filter(Boolean)
  const allowed = (to: string) => {
    const address = to.toLowerCase()
    return entries.some((e) => (e.startsWith("@") ? address.endsWith(e) : address === e))
  }
  let last: EmailTransport | null = null
  return {
    send: (email) => {
      last = allowed(email.to) ? real : fallback
      return last.send(email)
    },
    reachedEnvelope: () => last?.reachedEnvelope?.() ?? true,
    close: () => {
      real.close?.()
      fallback.close?.()
    },
    abort: () => {
      real.abort?.()
      fallback.abort?.()
    },
  }
}
