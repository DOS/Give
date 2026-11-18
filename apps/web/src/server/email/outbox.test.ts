import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

import { CLAIM_BATCH, SEND_DEADLINE_MS, SEND_TIMEOUT_MS, sendDueEmails } from "./outbox"
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

    expect(outcome).toEqual({ claimed: 1, sent: 1, retrying: 0, dead: 0, stale: 0, released: 0 })
    expect(op(calls[0], "args")).toEqual([{ p_limit: CLAIM_BATCH }])
    expect(sent[0]).toMatchObject({
      from: OPTIONS.from,
      replyTo: "hi@give.vn",
      to: "org1@example.com",
      subject: "Chiến dịch “Nước sạch” đã được duyệt",
      idempotencyKey: "campaign_status_event:1",
    })
    expect(sent[0].headers["Message-ID"]).toBe(`<outbox-${row(1).id}@give.vn>`)
    expect(sent[0].headers["List-Unsubscribe"]).toBeUndefined()
    expect(completes()).toEqual([
      {
        p_id: row(1).id,
        p_attempt: 1,
        p_ok: true,
        p_error: null,
        p_provider_message_id: "ses-1",
        p_permanent: false,
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

  it("counts a stale result and keeps going when recording fails", async () => {
    claims = [[row(6), row(7)]]
    let n = 0
    const db = fakeDb((call) => {
      if (call.target === "rpc:complete_outbox") {
        n += 1
        return n === 1 ? { error: { code: "57014", message: "timeout" } } : { data: "stale" }
      }
      return handler(call)
    }, calls)
    const outcome = await sendDueEmails(db as never, transport, OPTIONS)
    expect(outcome).toEqual({ claimed: 2, sent: 0, retrying: 0, dead: 0, stale: 1, released: 0 })
    expect(sent).toHaveLength(2)
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

  it("stops after a send times out: that attempt fails, the rest of the batch goes back", async () => {
    vi.useFakeTimers()
    try {
      const stuck: EmailTransport = { send: () => new Promise(() => {}), close: vi.fn() }
      claims = [[row(80), row(81)]]
      completeStatus = "pending"
      const run = sendDueEmails(fakeDb(handler, calls) as never, stuck, { ...OPTIONS, now: () => 0 })
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS)
      const outcome = await run
      expect(outcome).toMatchObject({ claimed: 2, retrying: 1, released: 1 })
      expect(completes()[0]).toMatchObject({ p_id: row(80).id, p_ok: false, p_error: "send_timeout" })
      expect(calls.filter((c) => c.target === "rpc:claim_outbox")).toHaveLength(1)
      expect(stuck.close).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
