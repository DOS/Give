import { describe, expect, it } from "vitest"

import { pkceChallenge } from "./pkce"
import { needsRefresh, userFromAccessToken } from "./token"

/** An unsigned JWT; these helpers only decode, PostgREST verifies. */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.`
}

describe("userFromAccessToken", () => {
  it("reads the id, email and display name", () => {
    expect(
      userFromAccessToken(jwt({ sub: "u1", email: "a@example.com", user_metadata: { full_name: "Nguyễn A" } }))
    ).toEqual({ id: "u1", email: "a@example.com", name: "Nguyễn A" })
  })

  it("returns null without a usable subject", () => {
    expect(userFromAccessToken(undefined)).toBeNull()
    expect(userFromAccessToken("garbage")).toBeNull()
    expect(userFromAccessToken(jwt({ email: "a@example.com" }))).toBeNull()
  })
})

describe("needsRefresh", () => {
  const now = 1_800_000_000

  it("refreshes missing, malformed and nearly expired tokens", () => {
    expect(needsRefresh(undefined, 60, now)).toBe(true)
    expect(needsRefresh("garbage", 60, now)).toBe(true)
    expect(needsRefresh(jwt({ sub: "u1" }), 60, now)).toBe(true)
    expect(needsRefresh(jwt({ sub: "u1", exp: now + 30 }), 60, now)).toBe(true)
  })

  it("keeps tokens that are still fresh", () => {
    expect(needsRefresh(jwt({ sub: "u1", exp: now + 3600 }), 60, now)).toBe(false)
  })
})

describe("pkceChallenge", () => {
  it("matches the RFC 7636 example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )
  })
})
