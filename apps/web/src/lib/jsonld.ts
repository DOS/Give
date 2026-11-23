import type { OrganizerKind } from "./campaigns"
import { safeAvatarUrl } from "./organizer-handle"

/**
 * Serializes a JSON-LD object safely for inline `<script type="application/ld+json">`
 * rendering by escaping `<` and Unicode line/paragraph separators so user-supplied
 * text can never break out of the script element or break JS parsers.
 */
export function safeJsonLd(value: unknown): string {
  const json = JSON.stringify(value) ?? "null"
  return json
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "")
}

/** Schema.org `WebSite` with Sitelinks SearchAction pointing to `/campaigns?q=`. */
export function buildWebsiteJsonLd(origin: string) {
  const baseUrl = normalizeOrigin(origin)
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Give",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/campaigns?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }
}

/** Schema.org `FAQPage` structured data, or `null` when no FAQs exist. */
export function buildFaqPageJsonLd(faqs: readonly { question: string; answer: string }[]) {
  if (faqs.length === 0) return null
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}

export interface ProfilePageJsonLdInput {
  origin: string
  handle: string
  displayName: string
  kind?: OrganizerKind
  bio?: string | null
  avatarUrl?: string | null
  dateCreated?: string | null
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/i

/**
 * Schema.org `ProfilePage` structured data for `/u/[handle]`.
 * Validates `avatarUrl` via `safeAvatarUrl` and includes only public profile fields.
 */
export function buildProfilePageJsonLd({
  origin,
  handle,
  displayName,
  kind,
  bio,
  avatarUrl,
  dateCreated,
}: ProfilePageJsonLdInput) {
  const baseUrl = normalizeOrigin(origin)
  const profileUrl = `${baseUrl}/u/${encodeURIComponent(handle)}`
  const trimmedBio = bio?.trim()
  const safeImage = safeAvatarUrl(avatarUrl)
  const trimmedDateCreated = dateCreated?.trim()
  const validDateCreated =
    trimmedDateCreated && ISO_DATE_PATTERN.test(trimmedDateCreated) && !Number.isNaN(Date.parse(trimmedDateCreated))
      ? trimmedDateCreated
      : undefined

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: profileUrl,
    ...(validDateCreated ? { dateCreated: validDateCreated } : {}),
    mainEntity: {
      "@type": kind === "organization" ? "Organization" : "Person",
      name: displayName,
      alternateName: `@${handle}`,
      url: profileUrl,
      ...(trimmedBio ? { description: trimmedBio } : {}),
      ...(safeImage ? { image: safeImage } : {}),
    },
  }
}
