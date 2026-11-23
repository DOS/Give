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

  it("renders moderator_inquiry with ContactText mailto link and management action (DOS/Give#98)", async () => {
    state.handler = (call) => {
      if (call.target === "notices") {
        if (call.ops.some(([name]) => name === "is")) return { count: 1 }
        return {
          data: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              kind: "moderator_inquiry",
              campaign_id: ACTIVE_CAMPAIGN,
              payload: {
                campaign_slug: "ban-phim-co",
                campaign_title: "Bàn phím cơ",
                note: "Cần đối chiếu hóa đơn đặt linh kiện.",
              },
              created_at: "2026-11-16T04:00:00Z",
              read_at: null,
            },
          ],
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyNoticesPage())
    expect(state.calls.map((c) => c.target)).toEqual(["notices", "notices"])
    expect(html).toContain("Cần làm rõ thông tin chiến dịch")
    expect(html).toContain("Cần đối chiếu hóa đơn đặt linh kiện.")
    expect(html).toContain('href="mailto:hi@give.vn"')
    expect(html).toContain(`href="/me/campaigns/${ACTIVE_CAMPAIGN}"`)
    expect(html).toContain(">Quản lý chiến dịch<")
  })

  it("renders payment_account_changed neutrally when stopped and with payment CTA when active (DOS/Give#92)", async () => {
    state.handler = (call) => {
      if (call.target === "notices") {
        if (call.ops.some(([name]) => name === "is")) return { count: 2 }
        return {
          data: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              kind: "payment_account_changed",
              campaign_id: STOPPED_CAMPAIGN,
              payload: {
                campaign_title: "Đèn ngủ gỗ",
                reference_code: "GVSWP234",
                intended_amount: 500_000,
                received_amount: 0,
                changed_date: "2026-11-22",
                new_bank_bin: "970422",
                new_account_last4: "0002",
              },
              created_at: "2026-11-22T02:00:00Z",
              read_at: null,
            },
            {
              id: "88888888-8888-4888-8888-888888888888",
              kind: "payment_account_changed",
              campaign_id: ACTIVE_CAMPAIGN,
              payload: {
                campaign_title: "Bàn phím cơ",
                reference_code: "GVSWP567",
                intended_amount: 400_000,
                received_amount: 0,
                changed_date: "2026-11-22",
                new_bank_bin: "970422",
                new_account_name: "NGUYEN THI DAO",
                new_account_last4: "0002",
                old_bank_bin: "970436",
                old_account_last4: "0001",
              },
              created_at: "2026-11-22T01:00:00Z",
              read_at: null,
            },
          ],
        }
      }
      if (call.target === "campaigns") {
        return {
          data: [
            { id: STOPPED_CAMPAIGN, payments_stopped_at: "2026-11-22T03:00:00Z" },
            { id: ACTIVE_CAMPAIGN, payments_stopped_at: null },
          ],
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyNoticesPage())
    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(2)

    expect(items[0]).toContain("Yêu cầu thanh toán đang tạm dừng")
    expect(items[0]).toContain('href="/me/pledges/GVSWP234"')
    expect(items[0]).toContain(">Xem cam kết<")
    expect(items[0]).not.toContain(">Thanh toán ngay<")

    expect(items[1]).toContain("Tài khoản nhận thanh toán đã thay đổi")
    expect(items[1]).toContain("•••• 0002")
    expect(items[1]).toContain('href="/me/pledges/GVSWP567"')
    expect(items[1]).toContain(">Thanh toán ngay<")
  })

  it("renders campaign_closing_soon neutrally when stopped and with 'Xem và ủng hộ' when active (DOS/Give#337)", async () => {
    state.handler = (call) => {
      if (call.target === "notices") {
        if (call.ops.some(([name]) => name === "is")) return { count: 2 }
        return {
          data: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              kind: "campaign_closing_soon",
              campaign_id: STOPPED_CAMPAIGN,
              payload: {
                campaign_slug: "den-ngu-go",
                campaign_title: "Đèn ngủ gỗ",
                ends_at: "2026-11-25T10:00:00Z",
              },
              created_at: "2026-11-23T02:00:00Z",
              read_at: null,
            },
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              kind: "campaign_closing_soon",
              campaign_id: ACTIVE_CAMPAIGN,
              payload: {
                campaign_slug: "ban-phim-co",
                campaign_title: "Bàn phím cơ",
                ends_at: "2026-11-25T10:00:00Z",
              },
              created_at: "2026-11-23T01:00:00Z",
              read_at: null,
            },
          ],
        }
      }
      if (call.target === "campaigns") {
        return {
          data: [
            { id: STOPPED_CAMPAIGN, payments_stopped_at: "2026-11-23T00:00:00Z" },
            { id: ACTIVE_CAMPAIGN, payments_stopped_at: null },
          ],
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyNoticesPage())
    expect(state.calls.map((c) => c.target)).toContain("campaigns")
    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(2)

    expect(items[0]).toContain("Yêu cầu thanh toán đang tạm dừng")
    expect(items[0]).toContain('href="/campaigns/den-ngu-go"')
    expect(items[0]).toContain(">Xem chiến dịch<")
    expect(items[0]).not.toContain(">Xem và ủng hộ<")

    expect(items[1]).toContain("Chiến dịch sắp kết thúc")
    expect(items[1]).toContain("Bàn phím cơ")
    expect(items[1]).toContain('href="/campaigns/ban-phim-co"')
    expect(items[1]).toContain(">Xem và ủng hộ<")
  })
})
