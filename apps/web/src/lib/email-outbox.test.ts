import { describe, expect, it } from "vitest"

import { fakeDb, type Call } from "@/test/fake-db"

import { isAccountHold, listHeldEmails, listRetryingEmails, outboxExpiresAt, outboxMaxAgeDays } from "./email-outbox"

describe("outbox maximum age", () => {
  it("mirrors give.outbox_max_age", () => {
    expect(outboxMaxAgeDays("pledge_payment_reminder")).toBe(2)
    expect(outboxMaxAgeDays("pledge_payment_due")).toBe(14)
    expect(outboxMaxAgeDays("campaign_ended")).toBe(14)
    expect(outboxMaxAgeDays("donation_received")).toBe(7)
    expect(outboxMaxAgeDays("campaign_approved")).toBe(7)
  })

  it("counts from the later of queueing and the last deferral", () => {
    const created = "2026-11-01T00:00:00.000Z"
    expect(outboxExpiresAt({ kind: "donation_received", created_at: created, deferred_at: null }).toISOString()).toBe(
      "2026-11-08T00:00:00.000Z"
    )
    expect(
      outboxExpiresAt({
        kind: "pledge_payment_due",
        created_at: created,
        deferred_at: "2026-11-10T06:00:00.000Z",
      }).toISOString()
    ).toBe("2026-11-24T06:00:00.000Z")
  })
})

describe("held emails", () => {
  it("are recognised by the ACCOUNT: prefix only", () => {
    expect(isAccountHold("ACCOUNT: SMTP 450: disabled")).toBe(true)
    expect(isAccountHold("SMTP 450: ACCOUNT: x")).toBe(false)
    expect(isAccountHold(null)).toBe(false)
  })

  it("are listed apart from the emails waiting for an ordinary retry", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [], count: 0 }), calls)
    await listHeldEmails(db as never)
    await listRetryingEmails(db as never)
    expect(calls[0].ops).toContainEqual(["like", "last_error", "ACCOUNT:%"])
    expect(calls[0].ops).toContainEqual(["eq", "status", "pending"])
    expect(calls[1].ops).toContainEqual(["not", "last_error", "like", "ACCOUNT:%"])
    expect(calls[1].ops).toContainEqual(["gt", "attempts", 0])
  })
})
