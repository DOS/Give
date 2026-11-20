import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import { byteaHex, planStopSecret, signStopToken, verifiedStopTokenHash } from "./stop-link"

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

  it("takes the rate-limit secret, else the service-role key, and refuses a short one", () => {
    expect(planStopSecret({ GIVE_RATE_LIMIT_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xyz" })).toBe(
      SECRET
    )
    expect(planStopSecret({ SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xyz" })).toBe("service-role-key-xyz")
    expect(planStopSecret({ GIVE_RATE_LIMIT_SECRET: "short" })).toBeNull()
    expect(planStopSecret({})).toBeNull()
  })

  it("formats a hash as a bytea literal", () => {
    expect(byteaHex("00ff")).toBe("\\x00ff")
  })
})
