import "server-only"

import { siteOrigin } from "@/lib/auth/origin"
import { GIVE_CONTACT_EMAIL } from "@/lib/contact"

import type { OutboxRunOptions } from "./outbox"
import { createSmtpTransport } from "./smtp"
import type { EmailTransport } from "./transport"

/**
 * Email settings from the environment (DOS/Give#254). Give reuses DOS.Me's
 * provider, AWS SES (ap-southeast-1), over SMTP. Server-only variables:
 *
 * - SMTP_USER, SMTP_PASS: SES SMTP credentials (secrets; owner step).
 * - SMTP_HOST, SMTP_PORT: default email-smtp.ap-southeast-1.amazonaws.com:587.
 * - EMAIL_FROM: the sender, e.g. `Give <no-reply@give.vn>` (give.vn verified in SES).
 * - EMAIL_REPLY_TO: default hi@give.vn.
 * - EMAIL_LINK_ORIGIN: origin of the links in emails, e.g. https://beta.give.vn
 *   on beta. Defaults to NEXT_PUBLIC_SITE_URL, then https://give.vn in Production.
 *
 * Anything missing turns sending off: the job then claims nothing.
 */

export const DEFAULT_SMTP_HOST = "email-smtp.ap-southeast-1.amazonaws.com"
export const DEFAULT_SMTP_PORT = 587
const PRODUCTION_ORIGIN = "https://give.vn"

type Env = Record<string, string | undefined>

export type EmailSettings =
  { ok: true; transport: EmailTransport; options: OutboxRunOptions } | { ok: false; missing: string[] }

/** `Name <local@domain>` or `local@domain`, on one line. */
export function isSenderAddress(value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value) || value.length > 200) return false
  return /^(?:[^<>@]*<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/.test(value.trim())
}

export function emailLinkOrigin(env: Env = process.env): string | null {
  return (
    siteOrigin(env.EMAIL_LINK_ORIGIN) ??
    siteOrigin(env.NEXT_PUBLIC_SITE_URL) ??
    (env.VERCEL_ENV === "production" ? PRODUCTION_ORIGIN : null)
  )
}

export function emailSettingsFromEnv(env: Env = process.env): EmailSettings {
  const missing: string[] = []
  const user = env.SMTP_USER?.trim()
  const pass = env.SMTP_PASS?.trim()
  const from = env.EMAIL_FROM?.trim()
  const origin = emailLinkOrigin(env)
  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : DEFAULT_SMTP_PORT
  if (!user) missing.push("SMTP_USER")
  if (!pass) missing.push("SMTP_PASS")
  if (!from || !isSenderAddress(from)) missing.push("EMAIL_FROM")
  if (!origin) missing.push("EMAIL_LINK_ORIGIN")
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT")
  const replyTo = env.EMAIL_REPLY_TO?.trim() || GIVE_CONTACT_EMAIL
  if (!isSenderAddress(replyTo)) missing.push("EMAIL_REPLY_TO")
  if (missing.length > 0 || !user || !pass || !from || !origin) return { ok: false, missing }
  return {
    ok: true,
    transport: createSmtpTransport({ host: env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST, port, user, pass }),
    options: { origin, from, replyTo },
  }
}
