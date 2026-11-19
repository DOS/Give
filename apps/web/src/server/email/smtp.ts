import "server-only"

import net, { type Socket } from "node:net"

import nodemailer from "nodemailer"

import { ACCOUNT_HOLD_PREFIX } from "@/lib/email-outbox"

import type { EmailTransport, OutgoingEmail, SendResult } from "./transport"

/**
 * SMTP to the provider in the env (provider.ts: host, port, login, key), by
 * default Brevo's relay (smtp-relay.brevo.com:587, STARTTLS), on the Brevo
 * account and monthly email allowance shared across DOS. Nothing here is
 * specific to a provider except which replies mean "the whole account is
 * refused" (smtpFailure, keyed by smtpProvider).
 *
 * Only a recipient the server refused outright at RCPT TO counts as
 * permanent. A documented account-wide refusal (Brevo: 450 platform not
 * activated or disabled) is held: the run stops and the row waits an hour
 * without spending an attempt. Every other failure (timeouts, other 4xx, a
 * 5xx about the sender, 535 authentication, 525 unauthorized IP) is retried
 * by the outbox and ends 'dead' after the last attempt, where an admin can
 * send it again once fixed.
 *
 * Brevo does not refuse a message when the account's credits run out: it
 * accepts it (250), so the outbox records it sent, and holds it in its own
 * queue until credits come back (help.brevo.com article 115000188150). Such
 * a delay is only visible in Brevo (Transactional > Real time > Usage and
 * plan > Email queue), and Give's maximum ages do not apply to it.
 */

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

/**
 * Which provider a host belongs to, for the replies only that provider
 * documents. Everything else about the transport is the same for any SMTP
 * server.
 */
export type SmtpProvider = "brevo" | "other"

export function smtpProvider(host: string): SmtpProvider {
  const name = host.trim().toLowerCase().replace(/\.$/, "")
  // sendinblue.com: Brevo's former name, whose relay host still works.
  return /(^|\.)(brevo|sendinblue)\.com$/.test(name) ? "brevo" : "other"
}

/**
 * Brevo's documented account-wide refusals (help.brevo.com article
 * 115000188150): transactional sending not yet activated, or suspended.
 * Every email fails the same way until the owner fixes the account.
 */
const BREVO_ACCOUNT_REFUSAL = /SMTP account is not yet activated|sending platform is currently disabled/i

/** Opening the TCP connection may take this long (nodemailer's connectionTimeout covers the rest of its setup). */
export const CONNECT_TIMEOUT_MS = 10_000

/** Connection-level failures with no SMTP reply: the server may have taken the message before the line dropped. */
const LOST_CONNECTION_CODES = new Set(["ECONNECTION", "ESOCKET", "ETIMEDOUT"])

/** Replies to RCPT TO that mean this address can never be delivered to. */
const PERMANENT_RCPT_CODES = new Set([501, 550, 551, 553])

interface SmtpError {
  responseCode?: number
  code?: string
  command?: string
  response?: string
  message?: string
}

/**
 * afterEnvelope: the message had reached MAIL FROM. A connection lost before
 * that (connect, greeting, STARTTLS, AUTH) cannot have delivered anything.
 * provider: whose documented account-wide refusals to recognise; such a
 * failure is held (`hold`, last_error `ACCOUNT: ...`) instead of counted.
 */
export function smtpFailure(
  error: unknown,
  afterEnvelope = true,
  provider: SmtpProvider = "other"
): Extract<SendResult, { ok: false }> {
  const e = (error ?? {}) as SmtpError
  const code = typeof e.responseCode === "number" ? e.responseCode : null
  const detail = (e.response ?? e.message ?? "send_failed").replace(/\s+/g, " ").slice(0, 200)
  const refusedRecipient = e.code === "EENVELOPE" && e.command === "RCPT TO"
  const lost = afterEnvelope && code === null && e.command === "CONN" && LOST_CONNECTION_CODES.has(e.code ?? "")
  const text = code !== null ? `SMTP ${code}: ${detail}` : `${e.code ?? "SMTP"}: ${detail}`
  const hold = provider === "brevo" && code === 450 && BREVO_ACCOUNT_REFUSAL.test(detail)
  if (hold) return { ok: false, permanent: false, hold: true, error: `${ACCOUNT_HOLD_PREFIX} ${text}` }
  return {
    ok: false,
    permanent: refusedRecipient && code !== null && PERMANENT_RCPT_CODES.has(code),
    ...(lost ? { outcomeUnknown: true } : {}),
    error: text,
  }
}

/**
 * The id kept as provider_message_id: the Message-ID the message was sent
 * with (Brevo does not document what its 250 reply to DATA contains).
 */
export function sentMessageId(messageId: unknown): string | null {
  return typeof messageId === "string" && messageId !== "" ? messageId : null
}

type SocketCallback = (err: Error | null, socketOptions?: { connection: Socket }) => void

/**
 * Opens the connections nodemailer uses and keeps hold of them, so a send
 * the outbox gave up on can be cut off (`abort`) instead of finishing later:
 * nodemailer's own close() leaves a connection that is mid-send open until
 * that message is done.
 */
export function socketTracker(
  config: Pick<SmtpConfig, "host" | "port">,
  connect: (port: number, host: string) => Socket = (port, host) => net.connect({ port, host }),
  timeoutMs = CONNECT_TIMEOUT_MS
) {
  const open = new Set<Socket>()
  const connecting = new Set<(err: Error) => void>()
  return {
    getSocket(_options: unknown, callback: SocketCallback): void {
      const socket = connect(config.port, config.host)
      open.add(socket)
      socket.once("close", () => open.delete(socket))
      let settled = false
      const finish = (err: Error | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        connecting.delete(finish)
        socket.off("error", onError)
        if (err) {
          socket.destroy()
          callback(err)
        } else {
          callback(null, { connection: socket })
        }
      }
      connecting.add(finish)
      const onError = (err: Error) => finish(err)
      const timer = setTimeout(
        () => finish(Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" })),
        timeoutMs
      )
      socket.once("connect", () => finish(null))
      socket.once("error", onError)
    },
    /**
     * Resets every connection (TCP RST, so nothing still buffered, such as
     * the final "." of a message, goes out) and fails any still opening.
     */
    abort(): void {
      for (const fail of [...connecting]) fail(Object.assign(new Error("Connection aborted"), { code: "ECONNECTION" }))
      for (const socket of open) {
        if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy()
        else socket.destroy()
      }
      open.clear()
    },
    get openCount(): number {
      return open.size
    },
  }
}

/**
 * A logger that keeps nothing: it only notes when a send reaches MAIL FROM
 * (nodemailer's transactionLog passes each client command, never the body;
 * the AUTH line is ignored like every other).
 */
export function envelopeWatch() {
  let started = false
  const ignore = () => {}
  return {
    reset: () => {
      started = false
    },
    get started() {
      return started
    },
    logger: {
      trace: ignore,
      info: ignore,
      warn: ignore,
      error: ignore,
      fatal: ignore,
      debug: (entry: unknown, message?: unknown) => {
        if ((entry as { tnx?: unknown } | null)?.tnx === "client" && typeof message === "string") {
          if (/^MAIL FROM:/i.test(message)) started = true
        }
      },
    },
  }
}

export function createSmtpTransport(config: SmtpConfig): EmailTransport {
  const provider = smtpProvider(config.host)
  const sockets = socketTracker(config)
  const envelope = envelopeWatch()
  const transporter = nodemailer.createTransport({
    // One connection reused for the whole run (closed by the job at its end):
    // a new TLS + AUTH handshake per email is slow. Sends go one at a time,
    // at most a few dozen a minute; Brevo documents no rate limit for the
    // relay, and its HTTP API allows far more.
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
    getSocket: sockets.getSocket,
    logger: envelope.logger,
    transactionLog: true,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  return {
    close: () => transporter.close(),
    abort: () => {
      sockets.abort()
      transporter.close()
    },
    reachedEnvelope: () => envelope.started,
    async send(email: OutgoingEmail): Promise<SendResult> {
      const { "Message-ID": messageId, ...headers } = email.headers
      envelope.reset()
      try {
        const info = await transporter.sendMail({
          from: email.from,
          replyTo: email.replyTo,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers,
          messageId,
          disableUrlAccess: true,
          disableFileAccess: true,
        })
        const rejected = Array.isArray(info.rejected) ? info.rejected : []
        if (rejected.length > 0) {
          return { ok: false, permanent: true, error: "SMTP: recipient rejected" }
        }
        return { ok: true, messageId: sentMessageId(info.messageId) }
      } catch (error) {
        return smtpFailure(error, envelope.started, provider)
      }
    },
  }
}
