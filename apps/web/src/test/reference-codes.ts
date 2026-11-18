/**
 * A test-only mirror of the matcher's code search in DOS/DOS.Me
 * (give.normalize_transfer_content, give.code_check_char and
 * give.find_reference_codes, migrations 20261101100000 and 20261101110000),
 * so parser tests can show that a code survives the bank's wrapping. The
 * database stays the authority; this is never used by the app.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

/** Decomposed, combining marks dropped, đ -> D, upper case, only A-Z and 0-9 kept. */
export function normalizeTransferContent(content: string | null): string {
  return (content ?? "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
}

/** Body character i (1-based) has weight i + 1, the check character weight 1; the sum is 0 mod 31. */
export function codeCheckChar(body: string): string | null {
  if (body === "" || body.length > 29) return null
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const point = ALPHABET.indexOf(body[i])
    if (point < 0) return null
    sum = (sum + (i + 2) * point) % 31
  }
  return ALPHABET[(31 - sum) % 31]
}

/** A valid code from a six-character body, e.g. referenceCode("7K2M9Q"). */
export function referenceCode(body: string, prefix = "GV"): string {
  const check = codeCheckChar(body)
  if (body.length !== 6 || check === null) throw new Error("invalid code body")
  return `${prefix}${body}${check}`
}

/** Every valid code found anywhere in the normalised content, as the matcher finds them. */
export function findReferenceCodes(content: string | null, prefix = "GV"): string[] {
  const s = normalizeTransferContent(content)
  const found = new Set<string>()
  for (let i = 0; i + 9 <= s.length; i++) {
    const candidate = s.slice(i, i + 9)
    if (
      candidate.startsWith(prefix) &&
      [...candidate.slice(2)].every((c) => ALPHABET.includes(c)) &&
      codeCheckChar(candidate.slice(2, 8)) === candidate[8]
    ) {
      found.add(candidate)
    }
  }
  return [...found]
}
