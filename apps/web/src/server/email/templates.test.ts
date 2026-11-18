import { describe, expect, it } from "vitest"

import { EmailRenderError, escapeHtml, renderEmail, type OutboxEmail } from "./templates"

const ORIGIN = "https://give.vn"
const TOKEN = "ab".repeat(32)
const UNSUB = "77777777-7777-4777-8777-777777777777"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

function email(overrides: Partial<OutboxEmail> = {}): OutboxEmail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "donation_received",
    category: "transactional",
    to_email: "mai@example.com",
    payload: {
      campaign_id: CAMPAIGN,
      campaign_slug: "nuoc-sach",
      campaign_title: "Nước sạch cho bản",
      campaign_type: "give",
      reference_code: "GVABCDEFG",
      received_amount: 300000,
      guest: true,
    },
    attempt: 1,
    idempotency_key: "donation_received:x",
    unsubscribe_token: null,
    reference_code: "GVABCDEFG",
    tracking_token: TOKEN,
    ...overrides,
  }
}

describe("renderEmail: donation_received", () => {
  it("gives a guest the amount, the code and their own tracking link", () => {
    const r = renderEmail(email(), ORIGIN)
    expect(r.subject).toBe("Give đã nhận khoản ủng hộ của bạn cho chiến dịch “Nước sạch cho bản”")
    expect(r.text).toContain("300.000")
    expect(r.text).toContain("GVABCDEFG")
    expect(r.text).toContain(`${ORIGIN}/donations/GVABCDEFG/track?t=${TOKEN}`)
    expect(r.text).toContain("hết hạn sau 7 ngày")
    expect(r.html).toContain(`href="${ORIGIN}/donations/GVABCDEFG/track?t=${TOKEN}"`)
    expect(r.unsubscribeUrl).toBeNull()
    expect(r.oneClickUnsubscribeUrl).toBeNull()
    expect(r.text).not.toContain("Hủy đăng ký")
  })

  it("links a guest without a tracking token to the public statement", () => {
    const r = renderEmail(email({ tracking_token: null }), ORIGIN)
    expect(r.text).toContain(`${ORIGIN}/campaigns/nuoc-sach/statement`)
    expect(r.text).not.toContain("/track?")
  })

  it("links a signed-in donor to their contributions", () => {
    const r = renderEmail(email({ tracking_token: null, payload: { ...email().payload, guest: false } }), ORIGIN)
    expect(r.text).toContain(`${ORIGIN}/me/contributions`)
  })

  it("escapes organizer-written text and keeps headers on one line", () => {
    const r = renderEmail(
      email({ payload: { ...email().payload, campaign_title: 'Quỹ <script>alert("x")</script>\r\nBcc: a@b.c' } }),
      ORIGIN
    )
    expect(r.html).not.toContain("<script>")
    expect(r.html).toContain("&lt;script&gt;")
    expect(r.subject).not.toMatch(/[\r\n]/)
  })

  it("carries no images or remote content", () => {
    const r = renderEmail(email(), ORIGIN)
    expect(r.html).not.toMatch(/<img|<link|url\(/i)
  })
})

describe("renderEmail: pledges", () => {
  it("reuses the in-app notice wording and links the pledge", () => {
    const r = renderEmail(
      email({
        kind: "pledge_payment_due",
        tracking_token: null,
        payload: {
          campaign_id: CAMPAIGN,
          campaign_title: "Đèn học",
          campaign_type: "back",
          reference_code: "GVABCDEFG",
          intended_amount: 500000,
          payment_due_at: "2026-12-01T00:00:00Z",
        },
      }),
      ORIGIN
    )
    expect(r.subject).toBe("Đến hạn thanh toán cam kết")
    expect(r.text).toContain("500.000")
    expect(r.text).toContain(`${ORIGIN}/me/pledges/GVABCDEFG`)
  })

  it("tells a backer their pledge lapsed", () => {
    const r = renderEmail(
      email({ kind: "pledge_lapsed", tracking_token: null, payload: { reference_code: "GVABCDEFG" } }),
      ORIGIN
    )
    expect(r.subject).toBe("Cam kết đã quá hạn thanh toán")
  })
})

describe("renderEmail: organizer emails", () => {
  const organizer = (kind: string, payload: Record<string, unknown> = {}, extra: Partial<OutboxEmail> = {}) =>
    email({
      kind,
      tracking_token: null,
      reference_code: null,
      payload: { campaign_id: CAMPAIGN, campaign_slug: "nuoc-sach", campaign_title: "Nước sạch", ...payload },
      ...extra,
    })

  it.each([
    ["campaign_approved", "Chiến dịch “Nước sạch” đã được duyệt"],
    ["campaign_changes_requested", "Chiến dịch “Nước sạch” cần chỉnh sửa trước khi được duyệt"],
    ["campaign_suspended", "Chiến dịch “Nước sạch” đang bị tạm dừng"],
  ])("%s links the organizer's campaign page", (kind, subject) => {
    const r = renderEmail(organizer(kind), ORIGIN)
    expect(r.subject).toBe(subject)
    expect(r.text).toContain(`${ORIGIN}/me/campaigns/${CAMPAIGN}`)
    expect(r.unsubscribeUrl).toBeNull()
  })

  it("names a back campaign a project", () => {
    expect(renderEmail(organizer("campaign_approved", { campaign_type: "back" }), ORIGIN).subject).toBe(
      "Dự án “Nước sạch” đã được duyệt"
    )
  })

  it("summarises a give campaign and offers unsubscribe", () => {
    const r = renderEmail(
      organizer(
        "campaign_ended",
        { to_status: "closed", raised_amount: 1250000, supporter_count: 12, goal_amount: 5000000 },
        { category: "notification", unsubscribe_token: UNSUB }
      ),
      ORIGIN
    )
    expect(r.subject).toBe("Chiến dịch “Nước sạch” đã kết thúc")
    expect(r.text).toContain("1.250.000")
    expect(r.text).toContain("từ 12 người ủng hộ")
    expect(r.unsubscribeUrl).toBe(`${ORIGIN}/email/unsubscribe?t=${UNSUB}`)
    expect(r.oneClickUnsubscribeUrl).toBe(`${ORIGIN}/api/email/unsubscribe?t=${UNSUB}`)
    expect(r.text).toContain(r.unsubscribeUrl!)
    expect(r.html).toContain(`href="${r.unsubscribeUrl}"`)
  })

  it.each([
    ["succeeded", "Dự án “Nước sạch” đã đạt mục tiêu"],
    ["failed", "Dự án “Nước sạch” đã kết thúc và không đạt mục tiêu"],
  ])("summarises a %s back campaign", (toStatus, subject) => {
    const r = renderEmail(
      organizer(
        "campaign_ended",
        { campaign_type: "back", to_status: toStatus, pledged_amount: 900000, goal_amount: 1000000 },
        { category: "notification", unsubscribe_token: UNSUB }
      ),
      ORIGIN
    )
    expect(r.subject).toBe(subject)
    expect(r.text).toContain("900.000")
  })

  it("refuses a notification without its unsubscribe token", () => {
    expect(() =>
      renderEmail(organizer("campaign_ended", { to_status: "closed" }, { category: "notification" }), ORIGIN)
    ).toThrow(EmailRenderError)
  })
})

describe("renderEmail", () => {
  it("refuses an unknown kind", () => {
    expect(() => renderEmail(email({ kind: "marketing" }), ORIGIN)).toThrow(EmailRenderError)
  })

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })
})
