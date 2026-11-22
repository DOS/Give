import "server-only"

import net, { type Socket } from "node:net"

import nodemailer from "nodemailer"

import { THROTTLE_HOLD_PREFIX } from "@/lib/email-outbox"

import type { EmailTransport, OutgoingEmail, SendResult } from "./transport"

/**
 * SMTP to AWS SES, the provider DOS.Me already uses (apps/api EmailService,
 * nodemailer). Host, port, login and key all come from the env (provider.ts);
 * only the reading of a few documented replies depends on the provider
 * (smtpProvider).
 *
 * Only a recipient the server refused outright at RCPT TO counts as
 * permanent. SES's documented 454 "Daily message quota exceeded" is held:
 * the run stops and the row waits an hour without spending an attempt. Its
 * 454 "Maximum sending rate exceeded" stops the run but counts as an
 * ordinary failure (retried after a minute). Every other
 * failure (timeouts, other 4xx, a 5xx about the sender, 535 auth, 554
 * unverified address or access denied) is retried by the outbox and ends
 * 'dead' after the last attempt, where an admin can send it again once fixed.
 */

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

/** Whose documented replies to recognise; everything else is the same for any SMTP server. */
export type SmtpProvider = "ses" | "other"

export function smtpProvider(host: string): SmtpProvider {
  const name = host.trim().toLowerCase().replace(/\.$/, "")
  return /^email-smtp(-fips)?\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(name) ? "ses" : "other"
}

/**
 * SES's account-wide throttles (docs.aws.amazon.com/ses/latest/dg/troubleshoot-smtp.html),
 * both shared with DOS.Me. The 24-hour quota fails every email until it
 * frees up, so the row is held. The per-second rate clears in seconds, so
 * that failure counts as usual (retried after a minute) and only the run
 * stops.
 */
const SES_DAILY_QUOTA = /Throttling failure: Daily message quota exceeded/i
const SES_SEND_RATE = /Throttling failure: Maximum sending rate exceeded/i

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
 * provider: whose documented account-wide throttles to recognise: SES's
 * daily quota is held (`hold`, last_error `THROTTLE: ...`) instead of
 * counted; its per-second rate stops the run (`stop`) and counts as usual.
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
  if (provider === "ses" && code === 454 && SES_DAILY_QUOTA.test(detail)) {
    return { ok: false, permanent: false, hold: true, error: `${THROTTLE_HOLD_PREFIX} ${text}` }
  }
  if (provider === "ses" && code === 454 && SES_SEND_RATE.test(detail)) {
    return { ok: false, permanent: false, stop: true, error: text }
  }
  return {
    ok: false,
    permanent: refusedRecipient && code !== null && PERMANENT_RCPT_CODES.has(code),
    ...(lost ? { outcomeUnknown: true } : {}),
    error: text,
  }
}

/** SES answers "250 Ok <message id>"; keep that id, else nodemailer's Message-ID. */
export function sesMessageId(response: unknown, fallback: unknown): string | null {
  const match = typeof response === "string" ? /^250 Ok (\S+)/.exec(response) : null
  if (match) return match[1]
  return typeof fallback === "string" && fallback !== "" ? fallback : null
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
    // a new TLS + AUTH handshake per email to ap-southeast-1 is slow.
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
        return { ok: true, messageId: sesMessageId(info.response, info.messageId) }
      } catch (error) {
        return smtpFailure(error, envelope.started, provider)
      }
    },
  }
}
