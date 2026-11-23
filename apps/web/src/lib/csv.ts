/**
 * Pure RFC-4180 CSV serializer with CSV Formula Injection (DDE) neutralization
 * and UTF-8 BOM support for Vietnamese Excel compatibility.
 */

export type CsvCell = string | number | boolean | null | undefined

export interface CsvOptions {
  /** Prepend UTF-8 BOM (\uFEFF) so Excel detects UTF-8 Vietnamese diacritics. Defaults to true. */
  bom?: boolean
  /** Record terminator. Defaults to "\r\n" per RFC-4180. */
  newline?: "\r\n" | "\n"
}

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"])

/**
 * True when `value` starts with a spreadsheet formula trigger (=, +, -, @, \t, \r),
 * or begins with whitespace/ASCII control characters followed by one.
 */
function needsFormulaNeutralization(value: string): boolean {
  if (value.length === 0) return false
  if (FORMULA_TRIGGERS.has(value[0])) return true
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (FORMULA_TRIGGERS.has(ch)) return true
    const code = value.charCodeAt(i)
    if (code <= 0x20 || code === 0x7f || /\s/.test(ch)) continue
    return false
  }
  return false
}

/**
 * Neutralizes spreadsheet formula triggers by prefixing a single quote `'`.
 */
export function neutralizeCsvFormula(value: string): string {
  return needsFormulaNeutralization(value) ? `'${value}` : value
}

function cellToString(value: CsvCell): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  return String(value)
}

/**
 * Formats a single CSV cell per RFC-4180 after neutralizing formula triggers.
 * Finite non-negative numbers serialize as unquoted plain digits so spreadsheets
 * parse them as numeric values.
 */
export function formatCsvCell(value: CsvCell): string {
  const safe = neutralizeCsvFormula(cellToString(value))
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`
  }
  return safe
}

/** Formats one CSV record using comma delimiters. */
export function formatCsvRow(cells: readonly CsvCell[]): string {
  return cells.map(formatCsvCell).join(",")
}

/** Serializes rows into a formula-safe RFC-4180 CSV string. */
export function buildCsv(rows: readonly (readonly CsvCell[])[], options: CsvOptions = {}): string {
  const { bom = true, newline = "\r\n" } = options
  const body = rows.map(formatCsvRow).join(newline)
  return bom ? `\uFEFF${body}` : body
}

/**
 * Normalizes an arbitrary string into a safe ASCII filename slug restricted to [a-z0-9-].
 */
export function csvFilenameSlug(slug: string, fallback = "export"): string {
  const normalize = (input: string) =>
    input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "")

  return normalize(slug) || normalize(fallback) || "export"
}
