import { createHash } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import { byteaHex, planStopSecret, planStopSecrets, signStopToken, verifiedStopTokenHash } from "./stop-link"

const SECRET = "test-secret-0123456789"
const TOKEN = "ab".repeat(32)

describe("plan stop links", () => {
  it("signs a token and verifies it back to the hash the database stores", () => {
    const signed = signStopToken(TOKEN, SECRET)
    expect(signed).toMatch(/^[0-9a-f]{64}\.[A-Za-z0-9_-]{22}$/)
    expect(verifiedStopTokenHash(signed, SECRET)).toBe(
      createHash("sha256").update(Buffer.from(TOKEN, "hex")).digest("hex")
    )
  })

  it("refuses a tampered token or signature, another secret, or junk", () => {
    const signed = signStopToken(TOKEN, SECRET) as string
    const [token, sig] = signed.split(".")
    expect(verifiedStopTokenHash(`${"cd".repeat(32)}.${sig}`, SECRET)).toBeNull()
    expect(verifiedStopTokenHash(`${token}.${sig.slice(0, -1)}A`, SECRET)).toBeNull()
    expect(verifiedStopTokenHash(signed, "another-secret-0123")).toBeNull()
    for (const junk of [null, undefined, "", token, `${token}.`, `${token.toUpperCase()}.${sig}`]) {
      expect(verifiedStopTokenHash(junk, SECRET)).toBeNull()
    }
  })

  it("signs nothing without a token or a secret", () => {
    expect(signStopToken(null, SECRET)).toBeNull()
    expect(signStopToken("xyz", SECRET)).toBeNull()
    expect(signStopToken(TOKEN, null)).toBeNull()
    expect(verifiedStopTokenHash(signStopToken(TOKEN, SECRET), null)).toBeNull()
  })

  it("outside Production takes the rate-limit secret, else the service-role key", () => {
    expect(planStopSecret({ GIVE_RATE_LIMIT_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xyz" })).toBe(
      SECRET
    )
    expect(planStopSecret({ VERCEL_ENV: "preview", SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xyz" })).toBe(
      "service-role-key-xyz"
    )
    expect(planStopSecret({ GIVE_RATE_LIMIT_SECRET: "short" })).toBeNull()
    expect(planStopSecret({})).toBeNull()
  })

  it("in Production requires a rate-limit secret of 32 characters, never the service-role key, and logs without one", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const long = "p".repeat(32)
    expect(planStopSecret({ VERCEL_ENV: "production", GIVE_RATE_LIMIT_SECRET: long })).toBe(long)
    expect(planStopSecret({ VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40) })).toBeNull()
    expect(planStopSecret({ VERCEL_ENV: "production", GIVE_RATE_LIMIT_SECRET: SECRET })).toBeNull()
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it("verifies links signed with the previous secret during a rotation, and signs with the current one", () => {
    const env = { GIVE_RATE_LIMIT_SECRET: "new-secret-0123456789", GIVE_RATE_LIMIT_SECRET_PREVIOUS: SECRET }
    const secrets = planStopSecrets(env)
    expect(secrets).toEqual(["new-secret-0123456789", SECRET])
    const old = signStopToken(TOKEN, SECRET)
    expect(verifiedStopTokenHash(old, secrets)).not.toBeNull()
    expect(verifiedStopTokenHash(signStopToken(TOKEN, planStopSecret(env)), secrets)).not.toBeNull()
    expect(verifiedStopTokenHash(old, planStopSecrets({ GIVE_RATE_LIMIT_SECRET: "new-secret-0123456789" }))).toBeNull()
    // No previous secret is used without a current one.
    expect(planStopSecrets({ GIVE_RATE_LIMIT_SECRET_PREVIOUS: SECRET })).toEqual([])
  })

  it("formats a hash as a bytea literal", () => {
    expect(byteaHex("00ff")).toBe("\\x00ff")
  })
})
