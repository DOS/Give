import "server-only"

import { siteOrigin } from "@/lib/auth/origin"

import { allowlistTransport, createLogTransport } from "./log-transport"
import type { OutboxRunOptions } from "./outbox"
import { createSmtpTransport } from "./smtp"
import type { EmailTransport } from "./transport"

/**
 * Email settings from the environment (DOS/Give#254). Give reuses DOS.Me's
 * provider, AWS SES (ap-southeast-1), over SMTP, with its own sender.
 * Server-only variables:
 *
 * - EMAIL_DELIVERY: `smtp` sends real mail; `log` mails nobody (log
 *   transport). Production defaults to `smtp` and refuses `log` (it would
 *   mark every real email sent); everything else (beta, previews, local)
 *   defaults to `log`.
 * - EMAIL_ALLOWLIST: outside Production, `smtp` reaches only these
 *   recipients (comma-separated addresses or `@domain`); everyone else gets
 *   the log transport. With no allowlist outside Production, nobody is mailed.
 * - SMTP_USER, SMTP_PASS: SES SMTP credentials (secrets; owner step).
 * - SMTP_HOST, SMTP_PORT: default email-smtp.ap-southeast-1.amazonaws.com:587.
 * - EMAIL_FROM: default `Give <no-reply@give.vn>` (give.vn verified in SES).
 * - EMAIL_LINK_ORIGIN: origin of the links in emails, e.g. https://beta.give.vn
 *   on beta. Defaults to NEXT_PUBLIC_SITE_URL, then https://give.vn in
 *   Production. In Production a link origin that is set must be https.
 *
 * When the settings are not usable the job claims nothing, so queued emails
 * wait instead of being marked sent: Production with missing credentials or
 * with `log`, and a deployment outside Production that points at the
 * Production database.
 */

export const DEFAULT_SMTP_HOST = "email-smtp.ap-southeast-1.amazonaws.com"
export const DEFAULT_SMTP_PORT = 587
export const DEFAULT_EMAIL_FROM = "Give <no-reply@give.vn>"
const PRODUCTION_ORIGIN = "https://give.vn"
/** The Production DOS Supabase project (the shared `dos` project). */
export const PRODUCTION_SUPABASE_REF = "gulptwduchsjcsbndmua"
/** Every hostname that reaches it: the project's own and its vanity domain. */
export const PRODUCTION_SUPABASE_HOSTS: readonly string[] = [
  `${PRODUCTION_SUPABASE_REF}.supabase.co`,
  "dos.supabase.co",
]

type Env = Record<string, string | undefined>

export type EmailDelivery = "smtp" | "log"

export type EmailSettings =
  | { ok: true; delivery: EmailDelivery; transport: EmailTransport; options: OutboxRunOptions }
  | { ok: false; missing: string[] }

/** `Name <local@domain>` or `local@domain`, on one line. */
export function isSenderAddress(value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value) || value.length > 200) return false
  return /^(?:[^<>@]*<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/.test(value.trim())
}

export function emailLinkOrigin(env: Env = process.env): string | null {
  const production = env.VERCEL_ENV === "production"
  for (const value of [env.EMAIL_LINK_ORIGIN, env.NEXT_PUBLIC_SITE_URL]) {
    if (!value?.trim()) continue
    const origin = siteOrigin(value.trim())
    if (origin && (!production || origin.startsWith("https://"))) return origin
    // In Production a set origin that is not https is refused, not skipped:
    // links in real emails must not go out over plain http.
    if (production) return null
  }
  return production ? PRODUCTION_ORIGIN : null
}

export function usesProductionDatabase(env: Env = process.env): boolean {
  let host: string
  try {
    // A trailing dot (fully qualified name) reaches the same host.
    host = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.toLowerCase().replace(/\.+$/, "")
  } catch {
    return false
  }
  return PRODUCTION_SUPABASE_HOSTS.includes(host) || host.split(".")[0] === PRODUCTION_SUPABASE_REF
}

export function emailDelivery(env: Env = process.env): EmailDelivery {
  const value = env.EMAIL_DELIVERY?.trim().toLowerCase()
  if (value === "smtp" || value === "log") return value
  return env.VERCEL_ENV === "production" ? "smtp" : "log"
}

export function emailSettingsFromEnv(env: Env = process.env): EmailSettings {
  const missing: string[] = []
  const production = env.VERCEL_ENV === "production"
  const delivery = emailDelivery(env)
  const from = env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM
  const origin = emailLinkOrigin(env)
  // Outside Production the job must not settle Production's outbox: the
  // log transport would mark real people's emails sent without sending them.
  if (!production && usesProductionDatabase(env)) missing.push("NON_PRODUCTION_DEPLOYMENT_ON_PRODUCTION_DATABASE")
  // In Production the log transport would mark every real email sent.
  if (production && delivery === "log") missing.push("EMAIL_DELIVERY_LOG_IN_PRODUCTION")
  if (!isSenderAddress(from)) missing.push("EMAIL_FROM")
  if (!origin) missing.push("EMAIL_LINK_ORIGIN")

  let transport: EmailTransport | null = createLogTransport()
  if (delivery === "smtp") {
    const user = env.SMTP_USER?.trim()
    const pass = env.SMTP_PASS?.trim()
    const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : DEFAULT_SMTP_PORT
    if (!user) missing.push("SMTP_USER")
    if (!pass) missing.push("SMTP_PASS")
    if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT")
    if (user && pass && missing.length === 0) {
      const smtp = createSmtpTransport({ host: env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST, port, user, pass })
      const allowlist = (env.EMAIL_ALLOWLIST ?? "").split(",")
      transport = production ? smtp : allowlistTransport(allowlist, smtp, createLogTransport())
    } else {
      transport = null
    }
  }
  if (missing.length > 0 || !transport || !origin) return { ok: false, missing }
  return { ok: true, delivery, transport, options: { origin, from } }
}
