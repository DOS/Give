import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

import {
  CLAIM_BATCH,
  COMPLETE_TRIES,
  RPC_TIMEOUT_MS,
  RUN_LIMIT_MS,
  SEND_DEADLINE_MS,
  SEND_TIMEOUT_MS,
  sendDueEmails,
} from "./outbox"
import type { EmailTransport, OutgoingEmail, SendResult } from "./transport"

const OPTIONS = { origin: "https://give.vn", from: "Give <no-reply@give.vn>", replyTo: "hi@give.vn" }
const UNSUB = "77777777-7777-4777-8777-777777777777"

function row(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    kind: "campaign_approved",
    category: "transactional",
    to_email: `org${n}@example.com`,
    payload: { campaign_id: "22222222-2222-4222-8222-222222222222", campaign_title: "Nước sạch" },
    attempt: 1,
    idempotency_key: `campaign_status_event:${n}`,
    unsubscribe_token: null,
    reference_code: null,
    tracking_token: null,
    ...overrides,
  }
}

let calls: Call[]
let claims: unknown[][]
let completeStatus: string
let sent: OutgoingEmail[]
let result: SendResult | Error

const transport: EmailTransport = {
  close: vi.fn(),
  send: vi.fn(async (email: OutgoingEmail) => {
    sent.push(email)
    if (result instanceof Error) throw result
    return result
  }),
}

const handler: Handler = (call) => {
  if (call.target === "rpc:claim_outbox") return { data: claims.shift() ?? [] }
  if (call.target === "rpc:complete_outbox") return { data: completeStatus }
  if (call.target === "rpc:release_outbox") return { data: true }
  return undefined
}

beforeEach(() => {
  calls = []
  claims = []
  sent = []
  completeStatus = "sent"
  result = { ok: true, messageId: "ses-1" }
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

const completes = () => calls.filter((c) => c.target === "rpc:complete_outbox").map((c) => op(c, "args")?.[0])

describe("sendDueEmails", () => {
  it("sends each leased row and records the result for that attempt", async () => {
    claims = [[row(1)]]
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)

    expect(outcome).toEqual({ claimed: 1, sent: 1, retrying: 0, held: 0, dead: 0, stale: 0, released: 0 })
    expect(op(calls[0], "args")).toEqual([{ p_limit: CLAIM_BATCH }])
    expect(sent[0]).toMatchObject({
      from: OPTIONS.from,
      replyTo: "hi@give.vn",
      to: "org1@example.com",
      subject: "Chiến dịch “Nước sạch” đã được duyệt",
      idempotencyKey: "campaign_status_event:1",
    })
    expect(sent[0].headers["Message-ID"]).toBe(`<outbox-${row(1).id}@give.vn>`)
    expect(sent[0].headers["X-Give-Outbox-Id"]).toBe(row(1).id)
    expect(sent[0].headers["List-Unsubscribe"]).toBeUndefined()
    expect(completes()).toEqual([
      {
        p_id: row(1).id,
        p_attempt: 1,
        p_ok: true,
        p_error: null,
        p_provider_message_id: "ses-1",
        p_permanent: false,
        p_outcome_unknown: false,
      },
    ])
  })

  it("adds one-click unsubscribe headers to notification emails", async () => {
    claims = [
      [
        row(2, {
          kind: "campaign_ended",
          category: "notification",
          unsubscribe_token: UNSUB,
          payload: { campaign_title: "Nước sạch", to_status: "closed", raised_amount: 10 },
        }),
      ],
    ]
    await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)
    expect(sent[0].headers["List-Unsubscribe"]).toBe(`<https://give.vn/api/email/unsubscribe?t=${UNSUB}>`)
    expect(sent[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })

  it("reports a failure without the recipient's address, as permanent only when the provider says so", async () => {
    claims = [[row(3, { attempt: 4 })]]
    result = { ok: false, permanent: true, error: "SMTP 550: <org3@example.com> mailbox unavailable" }
    completeStatus = "dead"
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)
    expect(outcome.dead).toBe(1)
    expect(completes()[0]).toMatchObject({
      p_attempt: 4,
      p_ok: false,
      p_permanent: true,
      p_error: "SMTP 550: <[recipient]> mailbox unavailable",
    })
  })

  it("retries when the transport throws", async () => {
    claims = [[row(4)]]
    result = new Error("connect ETIMEDOUT")
    completeStatus = "pending"
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)
    expect(outcome.retrying).toBe(1)
    expect(completes()[0]).toMatchObject({ p_ok: false, p_permanent: false, p_error: "connect ETIMEDOUT" })
  })

  it("marks a row that cannot be rendered dead without sending it", async () => {
    claims = [[row(5, { kind: "marketing" })]]
    completeStatus = "dead"
    await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)
    expect(sent).toHaveLength(0)
    expect(completes()[0]).toMatchObject({ p_ok: false, p_permanent: true, p_error: "render: unknown_kind:marketing" })
  })

  it("tries again to record a result, then leaves the row to its lease and keeps going", async () => {
    vi.useFakeTimers()
    try {
      claims = [[row(6), row(7), row(9)]]
      const failing = new Set([row(6).id])
      let flaky = 0
      const db = fakeDb((call) => {
        if (call.target === "rpc:complete_outbox") {
          const id = (op(call, "args")?.[0] as { p_id: string }).p_id
          if (failing.has(id)) return { error: { code: "57014", message: "timeout" } }
          if (id === row(9).id && flaky++ === 0) return { error: { code: "08006", message: "reset" } }
          return { data: id === row(7).id ? "stale" : "sent" }
        }
        return handler(call)
      }, calls)
      const run = sendDueEmails(db as never, transport, OPTIONS)
      await vi.runAllTimersAsync()
      const outcome = await run
      expect(outcome).toEqual({ claimed: 3, sent: 1, retrying: 0, held: 0, dead: 0, stale: 1, released: 0 })
      expect(sent).toHaveLength(3)
      const tries = (id: string) => completes().filter((a) => (a as { p_id: string }).p_id === id).length
      expect(tries(row(6).id)).toBe(COMPLETE_TRIES)
      expect(tries(row(9).id)).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("a send that timed out before MAIL FROM is a plain failure, not outcome unknown", async () => {
    vi.useFakeTimers()
    try {
      const early: EmailTransport = {
        send: () => new Promise(() => {}),
        close: vi.fn(),
        abort: vi.fn(),
        reachedEnvelope: () => false,
      }
      claims = [[row(94)]]
      completeStatus = "pending"
      const run = sendDueEmails(fakeDb(handler, calls) as never, early, { ...OPTIONS, now: () => 0 })
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS)
      await run
      expect(completes()[0]).toMatchObject({
        p_outcome_unknown: false,
        p_error: "send_timeout: before the message was sent",
      })
      expect(early.abort).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not retry an error a second try cannot fix", async () => {
    claims = [[row(90)]]
    const db = fakeDb((call) => {
      if (call.target === "rpc:complete_outbox") return { error: { code: "P0002", message: "GIVE_OUTBOX_NOT_FOUND" } }
      return handler(call)
    }, calls)
    const outcome = await sendDueEmails(db as never, transport, OPTIONS)
    expect(outcome).toMatchObject({ sent: 0, stale: 0 })
    expect(completes()).toHaveLength(1)
  })

  it("reads the row when a retry finds its earlier try already recorded", async () => {
    vi.useFakeTimers()
    try {
      claims = [[row(91)]]
      let n = 0
      const db = fakeDb((call) => {
        if (call.target === "rpc:complete_outbox") {
          n += 1
          return n === 1 ? { error: { code: "", message: "TypeError: fetch failed" } } : { data: "stale" }
        }
        if (call.target === "outbox") return { data: { status: "sent", attempts: 1 } }
        return handler(call)
      }, calls)
      const run = sendDueEmails(db as never, transport, OPTIONS)
      await vi.runAllTimersAsync()
      expect(await run).toMatchObject({ sent: 1, stale: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("near the function limit, neither retries a result nor releases rows it has no time for", async () => {
    vi.useFakeTimers()
    try {
      const late: EmailTransport = { send: () => new Promise(() => {}), close: vi.fn(), abort: vi.fn() }
      claims = [[row(92), row(93)]]
      const db = fakeDb((call) => {
        if (call.target === "rpc:complete_outbox") return { error: { code: "57014", message: "timeout" } }
        return handler(call)
      }, calls)
      // The send starts in time; after its timeout the clock reads 1 s short of the limit.
      let t = 0
      const run = sendDueEmails(db as never, late, { ...OPTIONS, now: () => t })
      t = 0
      await vi.advanceTimersByTimeAsync(1)
      t = RUN_LIMIT_MS - RPC_TIMEOUT_MS + 1
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS)
      const outcome = await run
      expect(completes()).toHaveLength(1)
      expect(calls.filter((c) => c.target === "rpc:release_outbox")).toHaveLength(0)
      expect(outcome).toMatchObject({ claimed: 2, released: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("claims again while batches come back full, and stops at the time budget", async () => {
    claims = [Array.from({ length: CLAIM_BATCH }, (_, i) => row(10 + i)), [row(30)]]
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)
    expect(outcome.claimed).toBe(CLAIM_BATCH + 1)

    calls = []
    claims = [Array.from({ length: CLAIM_BATCH }, (_, i) => row(40 + i)), [row(60)]]
    const clock = [0, 0, 1000]
    const capped = await sendDueEmails(fakeDb(handler, calls) as never, transport, {
      ...OPTIONS,
      budgetMs: 100,
      now: () => clock.shift() ?? 1000,
    })
    expect(capped.claimed).toBe(CLAIM_BATCH)
    expect(calls.filter((c) => c.target === "rpc:claim_outbox")).toHaveLength(1)
  })

  it("throws when the first claim fails", async () => {
    const db = fakeDb(() => ({ error: { code: "42501", message: "denied" } }), calls)
    await expect(sendDueEmails(db as never, transport, OPTIONS)).rejects.toMatchObject({ code: "42501" })
  })

  it("skips a malformed row", async () => {
    claims = [[{ id: "x" }, row(8)]]
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)
    expect(outcome.sent).toBe(1)
    expect(sent).toHaveLength(1)
  })

  it("gives back the rows it cannot send before its deadline, and closes the transport", async () => {
    vi.mocked(transport.close!).mockClear()
    claims = [[row(70), row(71, { attempt: 3 }), row(72)]]
    // started at 0; the first send starts at 0, the second would start too late.
    const clock = [0, 0, 0, SEND_DEADLINE_MS - SEND_TIMEOUT_MS + 1]
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, {
      ...OPTIONS,
      now: () => clock.shift() ?? SEND_DEADLINE_MS,
    })
    expect(outcome).toMatchObject({ claimed: 3, sent: 1, released: 2 })
    expect(sent.map((e) => e.to)).toEqual(["org70@example.com"])
    expect(calls.filter((c) => c.target === "rpc:release_outbox").map((c) => op(c, "args")?.[0])).toEqual([
      { p_id: row(71).id, p_attempt: 3 },
      { p_id: row(72).id, p_attempt: 1 },
    ])
    expect(transport.close).toHaveBeenCalledTimes(1)
  })

  it("after a send times out: cuts the connection first, records outcome unknown, gives back the rest", async () => {
    vi.useFakeTimers()
    try {
      const order: string[] = []
      const stuck: EmailTransport = {
        send: () => new Promise(() => {}),
        close: vi.fn(),
        abort: vi.fn(() => {
          order.push("abort")
        }),
      }
      claims = [[row(80), row(81)]]
      completeStatus = "pending"
      const db = fakeDb((call) => {
        if (call.target === "rpc:complete_outbox") order.push("complete")
        return handler(call)
      }, calls)
      const run = sendDueEmails(db as never, stuck, { ...OPTIONS, now: () => 0 })
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS)
      const outcome = await run
      expect(outcome).toMatchObject({ claimed: 2, retrying: 1, released: 1 })
      expect(order).toEqual(["abort", "complete"])
      expect(completes()[0]).toMatchObject({
        p_id: row(80).id,
        p_ok: false,
        p_permanent: false,
        p_outcome_unknown: true,
        p_error: expect.stringMatching(/^send_timeout: outcome unknown/),
      })
      expect(calls.filter((c) => c.target === "rpc:claim_outbox")).toHaveLength(1)
      expect(stuck.close).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
  it("when the provider refuses every email: holds that row, gives back the rest, claims no more", async () => {
    claims = [[row(60), row(61), row(62)], [row(63)]]
    completeStatus = "held"
    result = { ok: false, permanent: false, hold: true, error: "ACCOUNT: SMTP 450: disabled for org60@example.com" }
    const outcome = await sendDueEmails(fakeDb(handler, calls) as never, transport, OPTIONS)

    expect(outcome).toEqual({ claimed: 3, sent: 0, retrying: 0, held: 1, dead: 0, stale: 0, released: 2 })
    expect(sent).toHaveLength(1)
    expect(completes()).toEqual([
      {
        p_id: row(60).id,
        p_attempt: 1,
        p_ok: false,
        p_error: "ACCOUNT: SMTP 450: disabled for [recipient]",
        p_provider_message_id: null,
        p_permanent: false,
        p_outcome_unknown: false,
        p_hold: true,
      },
    ])
    expect(calls.filter((c) => c.target === "rpc:release_outbox").map((c) => op(c, "args")?.[0])).toEqual([
      { p_id: row(61).id, p_attempt: 1 },
      { p_id: row(62).id, p_attempt: 1 },
    ])
    expect(calls.filter((c) => c.target === "rpc:claim_outbox")).toHaveLength(1)
  })

  it("reads back a hold whose answer was lost: the row shows the count before the claim", async () => {
    vi.useFakeTimers()
    try {
      claims = [[row(64, { attempt: 3 })]]
      result = { ok: false, permanent: false, hold: true, error: "ACCOUNT: SMTP 450" }
      let n = 0
      const db = fakeDb((call) => {
        if (call.target === "rpc:complete_outbox") {
          n += 1
          return n === 1 ? { error: { code: "", message: "TypeError: fetch failed" } } : { data: "stale" }
        }
        if (call.target === "outbox") return { data: { status: "pending", attempts: 2 } }
        return handler(call)
      }, calls)
      const run = sendDueEmails(db as never, transport, OPTIONS)
      await vi.runAllTimersAsync()
      expect(await run).toMatchObject({ held: 1, stale: 0 })
    } finally {
      vi.useRealTimers()
    }
  })
})
