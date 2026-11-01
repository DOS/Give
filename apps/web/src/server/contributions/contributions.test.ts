import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  acceptsDonations,
  accountNameMatches,
  donationCookie,
  donationCookieToken,
  guestContribution,
  normalizePersonName,
  paymentAccount,
  statusTokenHash,
} from "."

const TOKEN = "0123456789abcdef".repeat(4)
// encode(sha256(decode(TOKEN, 'hex')), 'hex') computed by Postgres.
const TOKEN_SHA256 = "4884fdaafea47c29fea7159d0daddd9c085d6200e1359e85bb81736af6b7c837"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

describe("statusTokenHash", () => {
  it("matches sha256(decode(token, 'hex')) in create_donation", () => {
    expect(statusTokenHash(TOKEN)).toBe(TOKEN_SHA256)
  })
})

describe("donationCookie", () => {
  it("is a __Host- cookie on deployed hosts", () => {
    expect(donationCookie("GVABCDEFG", "give.dos.me")).toEqual({
      name: "__Host-give_dn_GVABCDEFG",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    })
    expect(donationCookie("GVABCDEFG", "localhost").name).toBe("give_dn_GVABCDEFG")
    expect(donationCookie("GVABCDEFG", "localhost").options.secure).toBe(false)
  })

  it("only yields a well-formed token for that code", () => {
    const jar = new Map([["__Host-give_dn_GVABCDEFG", { value: TOKEN }]])
    expect(donationCookieToken(jar, "GVABCDEFG", "give.dos.me")).toBe(TOKEN)
    expect(donationCookieToken(jar, "GVABCDEFH", "give.dos.me")).toBeNull()
    expect(donationCookieToken(new Map([["give_dn_GVABCDEFG", { value: "x" }]]), "GVABCDEFG", "localhost")).toBeNull()
  })
})

describe("guestContribution", () => {
  const now = new Date("2026-11-01T00:00:00.000Z")
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "33333333-3333-4333-8333-333333333333",
    campaign_id: CAMPAIGN,
    intended_amount: 200000,
    received_amount: 0,
    reference_code: "GVABCDEFG",
    status: "awaiting_transfer",
    created_at: "2026-10-31T23:00:00.000Z",
    status_token_hash: `\\x${TOKEN_SHA256}`,
    status_token_expires_at: "2026-11-07T23:00:00.000Z",
    ...overrides,
  })

  it("returns the donation when the token's hash matches, without the token columns", async () => {
    const calls: Call[] = []
    const result = await guestContribution(fakeDb(() => ({ data: row() }), calls) as never, "GVABCDEFG", TOKEN, now)
    expect(result).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      campaign_id: CAMPAIGN,
      intended_amount: 200000,
      received_amount: 0,
      reference_code: "GVABCDEFG",
      status: "awaiting_transfer",
      created_at: "2026-10-31T23:00:00.000Z",
    })
    const call = calls[0]
    expect(call.target).toBe("contributions")
    expect(String(op(call, "select")?.[0])).not.toContain("*")
    expect(call.ops).toContainEqual(["eq", "reference_code", "GVABCDEFG"])
    expect(call.ops).toContainEqual(["is", "contributor_user_id", null])
    // The hash is compared in the app, never sent as a filter.
    expect(JSON.stringify(call.ops)).not.toContain(TOKEN_SHA256)
  })

  it.each([
    ["another donation's token", { status_token_hash: `\\x${"0".repeat(64)}` }],
    ["an expired token", { status_token_expires_at: "2026-11-01T00:00:00.000Z" }],
    ["no stored token", { status_token_hash: null, status_token_expires_at: null }],
  ])("refuses %s", async (_name, overrides) => {
    expect(
      await guestContribution(fakeDb(() => ({ data: row(overrides) })) as never, "GVABCDEFG", TOKEN, now)
    ).toBeNull()
  })

  it("does not query for a malformed token", async () => {
    const calls: Call[] = []
    expect(await guestContribution(fakeDb(() => undefined, calls) as never, "GVABCDEFG", "nope")).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe("normalizePersonName", () => {
  // Expected values computed by give.normalize_person_name in Postgres.
  it.each([
    ["Nguyễn Thị Đào-Müller  ß", "NGUYEN THI DAO MULLER SS"],
    [" trần  văn   ơn ", "TRAN VAN ON"],
    ["NGUYEN VAN AN", "NGUYEN VAN AN"],
  ])("normalises %j like the database", (input, expected) => {
    expect(normalizePersonName(input)).toBe(expected)
  })

  it("treats names with nothing left as no match", () => {
    expect(normalizePersonName(" - ")).toBeNull()
    expect(accountNameMatches("", "")).toBe(false)
    expect(accountNameMatches("NGUYEN VAN AN", "Nguyễn Văn An")).toBe(true)
    expect(accountNameMatches("NGUYEN VAN ANH", "Nguyễn Văn An")).toBe(false)
  })
})

describe("paymentAccount", () => {
  const binding = (account: Record<string, unknown> = {}, organizer: Record<string, unknown> = {}) => ({
    bound_at: "2026-11-01T00:00:00Z",
    account: {
      channel: "statement_import",
      bank_bin: "970436",
      account_number: "0123456789",
      account_name: "NGUYEN VAN A",
      verification_status: "verified",
      ...account,
    },
    campaign: { organizer: { verification_status: "verified", legal_name: "Nguyễn Văn A", ...organizer } },
  })

  it("picks the first active binding that create_donation would accept", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          binding({ verification_status: "disabled" }),
          binding({ account_name: "TRAN THI B", account_number: "111" }),
          binding({ account_number: "999888777" }),
        ],
      }),
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

  it.each([
    ["the organizer is no longer verified", [binding({}, { verification_status: "pending" })]],
    ["the account is pending", [binding({ verification_status: "pending" })]],
    ["the account name no longer matches the legal name", [binding({}, { legal_name: "Nguyễn Văn Bình" })]],
    ["the account row is missing", [{ bound_at: "x", account: null, campaign: null }]],
  ])("shows nothing when %s", async (_name, rows) => {
    expect(await paymentAccount(fakeDb(() => ({ data: rows })) as never, CAMPAIGN)).toBeNull()
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
