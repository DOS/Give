import { describe, expect, it } from "vitest"

import { paymentRequestsStopped, stopHoldsPledge } from "./payment-requests"

describe("stop on payment requests (DOS/Give#89)", () => {
  const stopped = { payments_stopped_at: "2026-11-05T00:00:00Z", payments_stopped_note: "Give đang xác minh." }

  it("knows when a campaign's payment requests are stopped", () => {
    expect(paymentRequestsStopped(stopped)).toBe(true)
    expect(paymentRequestsStopped({ payments_stopped_at: null, payments_stopped_note: null })).toBe(false)
    expect(paymentRequestsStopped(null)).toBe(false)
  })

  it("holds only pledges whose window was still open when the stop began", () => {
    expect(stopHoldsPledge(stopped, { payment_due_at: "2026-11-06T00:00:00Z" })).toBe(true)
    // Overdue before the stop: it lapses as usual, so the page must not promise a moved deadline.
    expect(stopHoldsPledge(stopped, { payment_due_at: "2026-11-04T23:00:00Z" })).toBe(false)
    expect(stopHoldsPledge(stopped, { payment_due_at: null })).toBe(false)
    expect(stopHoldsPledge({ payments_stopped_at: null }, { payment_due_at: "2026-11-06T00:00:00Z" })).toBe(false)
  })
})
