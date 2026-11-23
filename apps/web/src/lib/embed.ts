import { sanitizeAmbassadorRef } from "./ambassadors"

/**
 * Pure helpers for the clickjacking-safe `/embed/[slug]` widget and its
 * copy-paste `<iframe>` snippet builder (DOS/Give#335).
 *
 * Client-safe: never imports server-only modules or Supabase clients.
 */

export const EMBED_HEADER = "x-give-embed"

export const EMBED_THEMES = ["light", "dark", "auto"] as const
export type EmbedTheme = (typeof EMBED_THEMES)[number]

export const EMBED_THEME_LABELS: Record<EmbedTheme, string> = {
  light: "Sáng",
  dark: "Tối",
  auto: "Tự động",
}

export const EMBED_HEIGHT_DEFAULT = 280
export const EMBED_HEIGHT_COMPACT = 180

export interface EmbedOptions {
  theme: EmbedTheme
  compact: boolean
  ref: string | null
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

/**
 * Parses allowlisted `/embed/[slug]` query parameters (`theme`, `compact`, `ref`).
 * Unknown or malformed inputs safely fall back to defaults so untrusted query
 * strings can never reach styles, classes, or outbound URLs.
 */
export function parseEmbedOptions(params: Record<string, string | string[] | undefined> = {}): EmbedOptions {
  const rawTheme = firstParam(params.theme)
  const theme: EmbedTheme = rawTheme === "dark" || rawTheme === "auto" ? rawTheme : "light"
  const compact = firstParam(params.compact) === "1"
  const ref = sanitizeAmbassadorRef(params.ref)
  return { theme, compact, ref }
}

/** Escapes special HTML characters for safe interpolation inside HTML attributes. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function safeHttpOrigin(origin: string | undefined): string {
  if (!origin) return ""
  try {
    const parsed = new URL(origin)
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : ""
  } catch {
    return ""
  }
}

export function buildEmbedPath(
  slug: string,
  options: { theme?: EmbedTheme; compact?: boolean; ref?: string | null } = {}
): string {
  const params = new URLSearchParams()
  if (options.theme && options.theme !== "light") params.set("theme", options.theme)
  if (options.compact) params.set("compact", "1")
  const cleanRef = sanitizeAmbassadorRef(options.ref)
  if (cleanRef) params.set("ref", cleanRef)
  const query = params.toString()
  return `/embed/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`
}

export function buildEmbedUrl(
  slug: string,
  options: { origin?: string; theme?: EmbedTheme; compact?: boolean; ref?: string | null } = {}
): string {
  return `${safeHttpOrigin(options.origin)}${buildEmbedPath(slug, options)}`
}

export function buildCampaignOutboundUrl(slug: string, options: { origin?: string; ref?: string | null } = {}): string {
  const cleanRef = sanitizeAmbassadorRef(options.ref)
  const path = cleanRef
    ? `/campaigns/${encodeURIComponent(slug)}?ref=${encodeURIComponent(cleanRef)}`
    : `/campaigns/${encodeURIComponent(slug)}`
  return `${safeHttpOrigin(options.origin)}${path}`
}

export function buildEmbedIframeCode({
  slug,
  title,
  origin,
  theme = "light",
  compact = false,
  ref,
}: {
  slug: string
  title: string
  origin?: string
  theme?: EmbedTheme
  compact?: boolean
  ref?: string | null
}): string {
  const src = buildEmbedUrl(slug, { origin, theme, compact, ref })
  const height = compact ? EMBED_HEIGHT_COMPACT : EMBED_HEIGHT_DEFAULT
  const cleanTitle = title.replace(/\s+/g, " ").trim()
  const iframeTitle = cleanTitle ? `${cleanTitle} · Give` : "Chiến dịch Give"

  return `<iframe src="${escapeHtmlAttr(src)}" title="${escapeHtmlAttr(iframeTitle)}" width="100%" height="${height}" style="border:0;border-radius:6px;overflow:hidden" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
}
