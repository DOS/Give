/**
 * Organizer public profile handle & avatar helpers (DOS/Give#251, #261).
 *
 * Client-safe pure module (no server/database imports) so both the `/me`
 * profile editor and server actions/pages share exact validation parity with
 * `give.organizers_validate_handle` and `give.is_reserved_organizer_handle`.
 */

export const ORGANIZER_HANDLE_MIN = 3
export const ORGANIZER_HANDLE_MAX = 40
export const ORGANIZER_BIO_MAX = 500

/** Lowercase ASCII letters, digits, single internal hyphens (mirrors DB CHECK). */
export const ORGANIZER_HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const ORGANIZER_HANDLE_INVALID_MESSAGE =
  "Đường dẫn hồ sơ dài 3–40 ký tự, chỉ gồm chữ thường không dấu (a-z), số (0-9) và dấu gạch ngang ở giữa."
export const ORGANIZER_HANDLE_RESERVED_MESSAGE = "Đường dẫn này được hệ thống giữ chỗ. Hãy chọn tên khác."
export const ORGANIZER_HANDLE_TAKEN_MESSAGE = "Đường dẫn hồ sơ này đã có người sử dụng. Hãy chọn tên khác."
export const ORGANIZER_BIO_TOO_LONG_MESSAGE = "Giới thiệu bản thân tối đa 500 ký tự."

/**
 * Exact copy of `give.is_reserved_organizer_handle(text)` in DOS/DOS.Me
 * `supabase/migrations/20261129160000_give_organizer_public_profile.sql`.
 */
export const RESERVED_ORGANIZER_HANDLES: ReadonlySet<string> = new Set([
  "about",
  "account",
  "accounts",
  "admin",
  "admins",
  "api",
  "app",
  "assets",
  "auth",
  "back",
  "billing",
  "blog",
  "callback",
  "campaign",
  "campaigns",
  "categories",
  "category",
  "contact",
  "create",
  "dashboard",
  "delete",
  "discover",
  "docs",
  "donate",
  "donation",
  "donations",
  "dos",
  "dos-me",
  "dosme",
  "edit",
  "email",
  "explore",
  "faq",
  "ftp",
  "give",
  "give-vn",
  "givevn",
  "health",
  "help",
  "home",
  "images",
  "index",
  "legal",
  "login",
  "logout",
  "mail",
  "me",
  "media",
  "moderation",
  "moderator",
  "new",
  "news",
  "null",
  "oauth",
  "official",
  "organizer",
  "organizers",
  "payout",
  "payouts",
  "plans",
  "pledge",
  "pledges",
  "press",
  "privacy",
  "profile",
  "profiles",
  "public",
  "register",
  "report",
  "reports",
  "root",
  "safety",
  "search",
  "security",
  "settings",
  "signin",
  "signout",
  "signup",
  "sso",
  "staff",
  "start",
  "static",
  "status",
  "support",
  "system",
  "terms",
  "trust",
  "u",
  "undefined",
  "user",
  "users",
  "verification",
  "verify",
  "webhook",
  "webhooks",
  "www",
])

/** Lowercases and trims user input, matching `lower(btrim(p_handle))` in SQL. */
export function normalizeOrganizerHandle(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidOrganizerHandleFormat(handle: string): boolean {
  return (
    handle.length >= ORGANIZER_HANDLE_MIN &&
    handle.length <= ORGANIZER_HANDLE_MAX &&
    ORGANIZER_HANDLE_PATTERN.test(handle)
  )
}

export function isReservedOrganizerHandle(handle: string): boolean {
  return RESERVED_ORGANIZER_HANDLES.has(normalizeOrganizerHandle(handle))
}

/** True when a stored handle is safe to link to `/u/<handle>`. */
export function isNavigableOrganizerHandle(handle: string | null | undefined): handle is string {
  if (typeof handle !== "string") return false
  return (
    handle === normalizeOrganizerHandle(handle) &&
    isValidOrganizerHandleFormat(handle) &&
    !isReservedOrganizerHandle(handle)
  )
}

/** Public profile URL path for a validated handle. */
export function organizerProfileHref(handle: string): string {
  return `/u/${encodeURIComponent(handle)}`
}

export type HandleValidationResult =
  { ok: true; value: string | null } | { ok: false; reason: "invalid" | "reserved"; message: string }

/**
 * Validates and normalizes an optional organizer handle.
 * Empty input clears the handle (`null`), matching the nullable column contract.
 */
export function validateOrganizerHandle(input: string): HandleValidationResult {
  const normalized = normalizeOrganizerHandle(input)
  if (normalized === "") return { ok: true, value: null }
  if (!isValidOrganizerHandleFormat(normalized)) {
    return { ok: false, reason: "invalid", message: ORGANIZER_HANDLE_INVALID_MESSAGE }
  }
  if (isReservedOrganizerHandle(normalized)) {
    return { ok: false, reason: "reserved", message: ORGANIZER_HANDLE_RESERVED_MESSAGE }
  }
  return { ok: true, value: normalized }
}

/** First display initial for avatar fallback tiles (Unicode-safe). */
export function organizerInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toUpperCase() ?? ""
}

const PRIVATE_IPV4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/

function isBlockedAvatarHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.startsWith("[") ||
    PRIVATE_IPV4.test(host)
  ) {
    return true
  }
  return false
}

/**
 * Validates a DOS ID avatar URL before rendering in `<img>` or Open Graph tags.
 * Only allows public HTTPS URLs without embedded credentials or control chars.
 */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null
  const trimmed = url.trim()
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f]/.test(trimmed)) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:") return null
    if (parsed.username !== "" || parsed.password !== "") return null
    if (isBlockedAvatarHost(parsed.hostname)) return null
    return parsed.toString()
  } catch {
    return null
  }
}
