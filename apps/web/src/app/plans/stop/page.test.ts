import { createHash } from "node:crypto"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { signStopToken } from "@/server/plans/stop-link"
import { fakeDb, op, type Call, type Result } from "@/test/fake-db"

const SECRET = "test-secret-at-least-16"
const TOKEN = "cd".repeat(32)
const HASH = createHash("sha256").update(Buffer.from(TOKEN, "hex")).digest("hex")

const state = vi.hoisted(() => ({ result: {} as Result, calls: [] as Call[] }))

vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb(() => state.result, state.calls),
}))

const { default: PlanStopPage, metadata } = await import("./page")

let signed: string

async function render(params: Record<string, string>): Promise<string> {
  return renderToStaticMarkup(await PlanStopPage({ searchParams: Promise.resolve(params) }))
}

const row = (s: string) => ({
  data: [{ state: s, campaign_title: "Nước sạch cho bản", campaign_slug: "nuoc-sach", amount: 200000 }],
})

beforeEach(() => {
  vi.stubEnv("GIVE_RATE_LIMIT_SECRET", SECRET)
  signed = signStopToken(TOKEN, SECRET)!
  state.result = row("active")
  state.calls.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
  return () => vi.unstubAllEnvs()
})

describe("/plans/stop", () => {
  it("is not indexed and sends no referrer", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.referrer).toBe("no-referrer")
  })

  it("asks before stopping an active plan, with one button that posts the link", async () => {
    const html = await render({ t: signed })
    expect(html).toContain("Dừng ủng hộ hằng tháng?")
    expect(html).toContain("Nước sạch cho bản")
    expect(html).toContain("200.000")
    expect(html).toContain('action="/api/plans/stop"')
    expect(html).toContain('method="post"')
    expect(html).toContain(`name="t" value="${signed}"`)
    expect(html.match(/<button/g)).toHaveLength(1)
    // Opening the page only reads the link's status.
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:plan_stop_token_status"])
    expect(op(state.calls[0], "args")).toEqual([{ p_token_hash: `\\x${HASH}` }])
  })

  it("never calls the database for a link whose signature does not check out", async () => {
    for (const t of ["", "nope", `${TOKEN}.AAAAAAAAAAAAAAAAAAAAAA`]) {
      const html = await render({ t })
      expect(html, t).toContain("Đường dẫn không hợp lệ")
      expect(html).not.toContain("<form")
    }
    expect(state.calls).toHaveLength(0)
  })

  it("says a plan is already stopped", async () => {
    state.result = row("stopped")
    const html = await render({ t: signed })
    expect(html).toContain("Kế hoạch đã dừng")
    expect(html).toContain('href="/campaigns/nuoc-sach"')
    expect(html).not.toContain("<form")
  })

  it("sends an expired link to /me/contributions", async () => {
    state.result = row("expired")
    const html = await render({ t: signed })
    expect(html).toContain("Đường dẫn đã hết hạn")
    expect(html).toContain('href="/me/contributions"')
    expect(html).not.toContain("<form")
  })

  it("treats a token the database does not know as invalid", async () => {
    state.result = { data: [{ state: "invalid", campaign_title: null, campaign_slug: null, amount: null }] }
    expect(await render({ t: signed })).toContain("Đường dẫn không hợp lệ")
  })

  it("still offers the button when the status cannot be read", async () => {
    state.result = { error: { code: "57014", message: "timeout" } }
    const html = await render({ t: signed })
    expect(html).toContain("Dừng ủng hộ hằng tháng?")
    expect(html).toContain('action="/api/plans/stop"')
  })

  it.each([
    ["done", "Đã dừng ủng hộ hằng tháng"],
    ["expired", "Đường dẫn đã hết hạn"],
    ["invalid", "Đường dẫn không hợp lệ"],
  ])("shows the result %s of the POST without reading the database", async (result, title) => {
    expect(await render({ result })).toContain(title)
    expect(state.calls).toHaveLength(0)
  })

  it("offers to try again after an error", async () => {
    const html = await render({ t: signed, result: "error" })
    expect(html).toContain("Chưa dừng được")
    expect(html).toContain(`value="${signed}"`)
    expect(state.calls).toHaveLength(0)
  })
})
