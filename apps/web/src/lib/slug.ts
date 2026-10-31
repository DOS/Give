/**
 * Builds a URL slug from a Vietnamese title: strips diacritics (including
 * đ/Đ, which NFD does not decompose), lowercases, and joins words with "-".
 * Matches the DB check ^[a-z0-9]+(-[a-z0-9]+)*$ and its 80-character limit.
 */
export function slugify(title: string, maxLength = 60): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const trimmed = base.slice(0, maxLength).replace(/-+$/g, "")
  return trimmed || "chien-dich"
}

/** Appends a short random suffix so two campaigns with one title never clash. */
export function uniqueSlug(title: string, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 5)
    .toString(36)
    .padStart(5, "0")
  return `${slugify(title)}-${suffix}`
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
