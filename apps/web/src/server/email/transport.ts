import "server-only"

/**
 * How the outbox hands an email to a provider. The send-outbox job only
 * needs `send`; the provider (DOS.Me's AWS SES, DOS/Give#254) is chosen in
 * `transportFromEnv`.
 */

export interface OutgoingEmail {
  from: string
  replyTo?: string
  to: string
  subject: string
  text: string
  html: string
  headers: Record<string, string>
  /** The outbox row's idempotency key, for providers that deduplicate by key. */
  idempotencyKey: string
}

export type SendResult =
  | { ok: true; messageId: string | null }
  /** permanent: the provider refused this message for good (bad address); retrying cannot help. */
  | { ok: false; permanent: boolean; error: string }

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<SendResult>
}
