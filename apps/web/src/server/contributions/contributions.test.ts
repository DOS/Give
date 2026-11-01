import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import { acceptsDonations, donationCookie, guestContribution, paymentAccount, statusTokenHash } from "."

const TOKEN = "0123456789abcdef".repeat(4)
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

describe("statusTokenHash", () => {
  it("hashes the token's bytes like sha256(decode(token, 'hex')) in create_donation", () => {
    expect(statusTokenHash(TOKEN)).toBe(createHash("sha256").update(Buffer.from(TOKEN, "hex")).digest("hex"))
    expect(statusTokenHash(TOKEN)).not.toBe(createHash("sha256").update(TOKEN).digest("hex"))
  })
})

describe("donationCookie", () => {
  it("is scoped to the donation's page and Secure on deployed hosts", () => {
    expect(donationCookie("GVABCDEFG", "give.dos.me")).toEqual({
      name: "__Secure-give_dn_GVABCDEFG",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/donations/GVABCDEFG" },
    })
    expect(donationCookie("GVABCDEFG", "localhost").name).toBe("give_dn_GVABCDEFG")
    expect(donationCookie("GVABCDEFG", "localhost").options.secure).toBe(false)
  })
})

describe("guestContribution", () => {
  it("matches code, token hash and expiry, listing its columns", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: { id: "x" } }), calls)
    const now = new Date("2026-11-01T00:00:00.000Z")
    await guestContribution(db as never, "GVABCDEFG", TOKEN, now)
    const call = calls[0]
    expect(call.target).toBe("contributions")
    expect(String(op(call, "select")?.[0])).not.toContain("*")
    expect(String(op(call, "select")?.[0])).not.toContain("status_token")
    expect(call.ops).toContainEqual(["eq", "reference_code", "GVABCDEFG"])
    expect(call.ops).toContainEqual(["eq", "status_token_hash", `\\x${statusTokenHash(TOKEN)}`])
    expect(call.ops).toContainEqual(["gt", "status_token_expires_at", now.toISOString()])
  })

  it("does not query for a malformed token", async () => {
    const calls: Call[] = []
    expect(await guestContribution(fakeDb(() => undefined, calls) as never, "GVABCDEFG", "nope")).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe("paymentAccount", () => {
  const account = (overrides: Record<string, unknown> = {}) => ({
    bound_at: "2026-11-01T00:00:00Z",
    account: {
      channel: "statement_import",
      bank_bin: "970436",
      account_number: "0123456789",
      account_name: "NGUYEN VAN A",
      verification_status: "verified",
      ...overrides,
    },
  })

  it("picks the first active binding to a verified bank account", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({ data: [account({ verification_status: "disabled" }), account({ account_number: "999888777" })] }),
      calls
    )
    expect(await paymentAccount(db as never, CAMPAIGN)).toEqual({
      bank_bin: "970436",
      account_number: "999888777",
      account_name: "NGUYEN VAN A",
    })
    expect(calls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(calls[0].ops).toContainEqual(["is", "released_at", null])
  })

  it("returns null when nothing usable is bound", async () => {
    const db = fakeDb(() => ({ data: [account({ verification_status: "pending" }), { bound_at: "x", account: null }] }))
    expect(await paymentAccount(db as never, CAMPAIGN)).toBeNull()
  })
})

describe("acceptsDonations", () => {
  const now = new Date("2026-11-10T00:00:00Z")
  const live = {
    type: "give" as const,
    status: "live",
    starts_at: "2026-11-01T00:00:00Z",
    ends_at: "2026-12-01T00:00:00Z",
  }

  it("mirrors the create_donation checks", () => {
    expect(acceptsDonations(live, now)).toBe(true)
    expect(acceptsDonations({ ...live, starts_at: null, ends_at: null }, now)).toBe(true)
    expect(acceptsDonations({ ...live, type: "back" }, now)).toBe(false)
    expect(acceptsDonations({ ...live, status: "closed" }, now)).toBe(false)
    expect(acceptsDonations({ ...live, ends_at: "2026-11-10T00:00:00Z" }, now)).toBe(false)
    expect(acceptsDonations({ ...live, starts_at: "2026-11-11T00:00:00Z" }, now)).toBe(false)
  })
})
