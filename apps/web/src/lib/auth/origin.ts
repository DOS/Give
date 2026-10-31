/**
 * The origin the login flow runs on. When NEXT_PUBLIC_SITE_URL is set, it
 * wins over the request's Host header, so the OAuth redirect_uri never comes
 * from a header a proxy might pass through unchecked. Leave it unset (e.g. on
 * Vercel previews) to use the request origin.
 */
export function appOrigin(requestOrigin: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!siteUrl) return requestOrigin
  try {
    const url = new URL(siteUrl)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : requestOrigin
  } catch {
    return requestOrigin
  }
}
