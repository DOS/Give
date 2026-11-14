import { Writable } from "node:stream"
import type { ReactNode } from "react"
import { createElement } from "react"
import { renderToPipeableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const STOPPED_CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const ACTIVE_CAMPAIGN = "55555555-5555-4555-8555-555555555555"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  serviceUsed: false,
}))

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
  dbService: () => {
    state.serviceUsed = true
    return fakeDb(() => undefined)
  },
}))
vi.mock("../_components/MePage", () => ({
  MePage: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}))

const { default: MyNoticesPage } = await import("./page")

function renderAsync(node: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = ""
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString()
        callback()
      },
    })
    const { pipe } = renderToPipeableStream(node, {
      onAllReady() {
        pipe(sink)
      },
      onError(error) {
        reject(error)
      },
    })
    sink.on("finish", () => resolve(html))
    sink.on("error", reject)
  })
}

beforeEach(() => {
  state.calls.length = 0
  state.serviceUsed = false
})

describe("MyNoticesPage (DOS/Give#93)", () => {
  it("renders older reminder and due notices neutrally with 'Xem cam kết' while their campaign is stopped", async () => {
    state.handler = (call) => {
      if (call.target === "notices") {
        if (call.ops.some(([name]) => name === "is")) return { count: 2 }
        return {
          data: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              kind: "payment_reminder",
              campaign_id: STOPPED_CAMPAIGN,
              payload: {
                campaign_title: "Đèn ngủ gỗ",
                reference_code: "GVSTP2345",
                intended_amount: 500_000,
                received_amount: 0,
                amount_due: 500_000,
                payment_due_at: "2026-11-18T03:00:00Z",
              },
              created_at: "2026-11-12T02:00:00Z",
              read_at: null,
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              kind: "payment_due",
              campaign_id: ACTIVE_CAMPAIGN,
              payload: {
                campaign_title: "Bàn phím cơ",
                reference_code: "GVACT2345",
                intended_amount: 400_000,
                received_amount: 0,
                payment_due_at: "2026-11-19T03:00:00Z",
              },
              created_at: "2026-11-11T02:00:00Z",
              read_at: null,
            },
          ],
        }
      }
      if (call.target === "campaigns") {
        return {
          data: [
            { id: STOPPED_CAMPAIGN, payments_stopped_at: "2026-11-13T00:00:00Z" },
            { id: ACTIVE_CAMPAIGN, payments_stopped_at: null },
          ],
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyNoticesPage())
    expect(state.serviceUsed).toBe(false)
    expect(state.calls.map((c) => c.target)).toContain("campaigns")

    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(2)

    expect(items[0]).toContain("Yêu cầu thanh toán đang tạm dừng")
    expect(items[0]).toContain("Give đang tạm dừng yêu cầu thanh toán của dự án “Đèn ngủ gỗ”.")
    expect(items[0]).not.toContain("Hãy thanh toán")
    expect(items[0]).not.toContain("Thanh toán ngay")
    expect(items[0]).toContain('href="/me/pledges/GVSTP2345"')
    expect(items[0]).toContain(">Xem cam kết<")

    expect(items[1]).toContain("Đến hạn thanh toán cam kết")
    expect(items[1]).toContain("Hãy thanh toán")
    expect(items[1]).toContain('href="/me/pledges/GVACT2345"')
    expect(items[1]).toContain(">Thanh toán ngay<")
  })
})
