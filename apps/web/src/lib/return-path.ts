/**
 * Keeps post-login redirects on this site: only same-origin absolute paths
 * are allowed. Anything else (other hosts, protocol-relative "//evil",
 * backslash tricks, auth routes that would loop) falls back to "/".
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "/"
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/"
  if (/[\u0000-\u001f]/.test(value)) return "/"
  let url: URL
  try {
    url = new URL(value, "https://give.invalid")
  } catch {
    return "/"
  }
  if (url.origin !== "https://give.invalid") return "/"
  if (url.pathname.startsWith("/auth/")) return "/"
  return `${url.pathname}${url.search}`
}
