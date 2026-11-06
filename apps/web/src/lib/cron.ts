import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Checks the "Authorization: Bearer <CRON_SECRET>" header Vercel Cron sends.
 * Fails closed when the secret is not configured or too short to be one.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest()
  const actual = createHash("sha256").update(authorization).digest()
  return timingSafeEqual(expected, actual)
}
