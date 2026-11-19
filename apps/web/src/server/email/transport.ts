import "server-only"

/**
 * How the outbox hands an email to a provider. The send-outbox job only
 * needs `send`; the provider (Brevo's SMTP relay, DOS/Give#254) is chosen in
 * `emailSettingsFromEnv` (provider.ts).
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
  /**
   * permanent: the provider refused this message for good (bad address);
   * retrying cannot help. outcomeUnknown: the connection was lost before
   * the provider answered, so it may have accepted the message. hold: the
   * provider refuses every message for now, not only this one (its account
   * is disabled or not yet activated); the run stops and the row is held.
   */
  | { ok: false; permanent: boolean; error: string; outcomeUnknown?: boolean; hold?: boolean }

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<SendResult>
  /** Closes idle connections at the end of a run. */
  close?(): void
  /**
   * Cuts off every connection at once, including one that is mid-send: after
   * a send times out, so the message cannot still be delivered later while
   * the outbox has recorded a failure.
   */
  abort?(): void
  /**
   * Whether the last send reached the SMTP envelope (MAIL FROM). A send cut
   * off before that cannot have been delivered. Unknown (absent) counts as yes.
   */
  reachedEnvelope?(): boolean
}
