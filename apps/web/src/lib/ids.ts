const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a canonical UUID string (ids bound into server actions can be tampered with). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}
