import { describe, expect, it } from "vitest"

import { fakeDb, type Call } from "@/test/fake-db"

import { EMAIL_KINDS } from "@/server/email/templates"

import {
  listHeldEmails,
  listRetryingEmails,
  OUTBOX_KIND_LABELS,
  OUTBOX_SKIP_LABELS,
  outboxExpiresAt,
  outboxMaxAgeDays,
} from "./email-outbox"

describe("outbox maximum age", () => {
  it("mirrors give.outbox_max_age", () => {
    expect(outboxMaxAgeDays("pledge_payment_reminder")).toBe(2)
    expect(outboxMaxAgeDays("pledge_payment_due")).toBe(14)
    expect(outboxMaxAgeDays("campaign_ended")).toBe(14)
    expect(outboxMaxAgeDays("donation_received")).toBe(7)
    expect(outboxMaxAgeDays("campaign_approved")).toBe(7)
    expect(outboxMaxAgeDays("plan_reminder")).toBe(3)
    expect(outboxMaxAgeDays("plan_followup")).toBe(2)
    expect(outboxMaxAgeDays("plan_ended")).toBe(14)
    expect(outboxMaxAgeDays("plan_account_swapped")).toBe(14)
  })

  it("labels every email kind the sender knows", () => {
    for (const kind of EMAIL_KINDS) expect(OUTBOX_KIND_LABELS[kind], kind).toBeTruthy()
    expect(OUTBOX_SKIP_LABELS.not_payable).toBeTruthy()
    expect(OUTBOX_SKIP_LABELS.plan_not_active).toBeTruthy()
    expect(OUTBOX_SKIP_LABELS.account_superseded).toBeTruthy()
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
  it("are listed apart from the emails waiting for an ordinary retry", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [], count: 0 }), calls)
    await listHeldEmails(db as never)
    await listRetryingEmails(db as never)
    expect(calls[0].ops).toContainEqual(["like", "last_error", "THROTTLE:%"])
    expect(calls[0].ops).toContainEqual(["eq", "status", "pending"])
    expect(calls[1].ops).toContainEqual(["or", "last_error.is.null,last_error.not.like.THROTTLE:*"])
    expect(calls[1].ops).toContainEqual(["gt", "attempts", 0])
  })
})
