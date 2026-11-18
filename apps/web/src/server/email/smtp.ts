import "server-only"

import nodemailer from "nodemailer"

import type { EmailTransport, OutgoingEmail, SendResult } from "./transport"

/**
 * SMTP to AWS SES, the provider DOS.Me already uses (apps/api EmailService,
 * nodemailer). Only an address the server refused outright counts as
 * permanent; every other failure (timeouts, 4xx, throttling, auth or
 * account problems) is retried by the outbox and ends 'dead' after the
 * last attempt, where an admin can send it again once fixed.
 */

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

/** 5xx replies that mean this recipient or address can never be delivered to. */
const PERMANENT_CODES = new Set([501, 550, 551, 553])

interface SmtpError {
  responseCode?: number
  code?: string
  response?: string
  message?: string
}

export function smtpFailure(error: unknown): Extract<SendResult, { ok: false }> {
  const e = (error ?? {}) as SmtpError
  const code = typeof e.responseCode === "number" ? e.responseCode : null
  const detail = (e.response ?? e.message ?? "send_failed").replace(/\s+/g, " ").slice(0, 200)
  return {
    ok: false,
    permanent: code !== null && PERMANENT_CODES.has(code),
    error: code !== null ? `SMTP ${code}: ${detail}` : `${e.code ?? "SMTP"}: ${detail}`,
  }
}

/** SES answers "250 Ok <message id>"; keep that id, else nodemailer's Message-ID. */
export function sesMessageId(response: unknown, fallback: unknown): string | null {
  const match = typeof response === "string" ? /^250 Ok (\S+)/.exec(response) : null
  if (match) return match[1]
  return typeof fallback === "string" && fallback !== "" ? fallback : null
}

export function createSmtpTransport(config: SmtpConfig): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  return {
    async send(email: OutgoingEmail): Promise<SendResult> {
      const { "Message-ID": messageId, ...headers } = email.headers
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
        return smtpFailure(error)
      }
    },
  }
}
