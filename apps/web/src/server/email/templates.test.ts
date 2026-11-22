import { describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"
import { NEW_CODE_EVERY_MONTH } from "@/lib/plans"

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
      asset: "VND",
      guest: true,
    },
    attempt: 1,
    idempotency_key: "donation_received:x",
    unsubscribe_token: null,
    reference_code: "GVABCDEFG",
    tracking_token: TOKEN,
    stop_token: null,
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

  it("states the amount only for a transfer in đồng", () => {
    for (const asset of ["USDT", undefined]) {
      const r = renderEmail(email({ payload: { ...email().payload, asset } }), ORIGIN)
      expect(r.text, String(asset)).not.toContain("300.000")
      expect(r.text, String(asset)).toContain("khoản chuyển của bạn")
    }
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
    ["campaign_changes_requested", "Chiến dịch của bạn cần chỉnh sửa trước khi được duyệt"],
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

describe("renderEmail: monthly plans (DOS/Give#276)", () => {
  const SIGNED = `${"cd".repeat(32)}.${"A".repeat(21)}w`
  const plan = (kind: string, payload: Record<string, unknown> = {}) =>
    email({
      kind,
      tracking_token: null,
      reference_code: "GVPLAN123",
      stop_token: "cd".repeat(32),
      payload: {
        campaign_id: CAMPAIGN,
        campaign_slug: "nuoc-sach",
        campaign_title: "Nước sạch cho bản",
        campaign_type: "give",
        plan_id: "33333333-3333-4333-8333-333333333333",
        amount: 200000,
        day_of_month: 5,
        contribution_id: "44444444-4444-4444-8444-444444444444",
        reference_code: "GVPLAN123",
        intended_amount: 200000,
        plan_period: "2026-11-01",
        first: false,
        ...payload,
      },
    })
  const FORBIDDEN = /quá hạn|nợ|còn thiếu/i

  it("gives a month's code, the new-code rule and a stop link, without bank details", () => {
    const r = renderEmail(plan("plan_reminder"), ORIGIN, { signedStopToken: SIGNED })
    expect(r.subject).toBe("Mã ủng hộ tháng 11/2026 cho chiến dịch “Nước sạch cho bản”")
    expect(r.text).toContain("GVPLAN123")
    expect(r.text).toContain("200.000")
    expect(r.text).toContain(NEW_CODE_EVERY_MONTH)
    expect(r.text).toContain("Nếu bạn đã chuyển thì bỏ qua email này")
    expect(r.text).toContain("tài khoản của người tổ chức")
    expect(r.text).toContain(`Xem mã QR tháng này: ${ORIGIN}/me/contributions`)
    const stop = `${ORIGIN}/plans/stop?t=${encodeURIComponent(SIGNED)}`
    expect(r.text).toContain(`Không muốn nhận lời nhắc nữa? Dừng ủng hộ hằng tháng: ${stop}`)
    expect(r.html).toContain(`href="${stop}"`)
    expect(r.oneClickUnsubscribeUrl).toBe(`${ORIGIN}/api/plans/stop?t=${encodeURIComponent(SIGNED)}`)
    expect(r.unsubscribeUrl).toBeNull()
    expect(r.text).not.toMatch(FORBIDDEN)
    expect(r.text).not.toMatch(/\d{6,}/)
  })

  it("confirms the plan started on the first reminder", () => {
    const r = renderEmail(plan("plan_reminder", { first: true }), ORIGIN, { signedStopToken: SIGNED })
    expect(r.subject).toBe("Bạn đã bắt đầu ủng hộ hằng tháng cho chiến dịch “Nước sạch cho bản”")
    expect(r.text).toContain("Cảm ơn bạn đã đăng ký ủng hộ 200.000")
    expect(r.text).toContain("GVPLAN123")
  })

  it("sends a gentle second reminder with the same stop link", () => {
    const r = renderEmail(plan("plan_followup"), ORIGIN, { signedStopToken: SIGNED })
    expect(r.subject).toBe("Nhắc lại: mã ủng hộ tháng 11/2026 cho chiến dịch “Nước sạch cho bản”")
    expect(r.text).toContain("Nếu bạn đã chuyển thì bỏ qua email này")
    expect(r.text).toContain(`${ORIGIN}/plans/stop?t=`)
    expect(r.oneClickUnsubscribeUrl).toBe(`${ORIGIN}/api/plans/stop?t=${encodeURIComponent(SIGNED)}`)
    expect(r.text).not.toMatch(FORBIDDEN)
  })

  it.each(["plan_reminder", "plan_followup"])("refuses %s without a signed stop token", (kind) => {
    expect(() => renderEmail(plan(kind), ORIGIN)).toThrow(new EmailRenderError("stop_token_missing"))
    expect(() => renderEmail(plan(kind), ORIGIN, { signedStopToken: null })).toThrow(EmailRenderError)
    expect(() => renderEmail(plan(kind), ORIGIN, { signedStopToken: "cd".repeat(32) })).toThrow(EmailRenderError)
  })

  it("tells the donor why the plan ended and to delete a saved transfer template", () => {
    const r = renderEmail(
      plan("plan_ended", {
        ended_reason: "campaign_closed",
        ended_at: "2026-12-01T00:00:00Z",
        bank_bin: "970436",
        account_last4: "6789",
      }),
      ORIGIN
    )
    expect(r.subject).toBe("Kế hoạch ủng hộ hằng tháng cho chiến dịch “Nước sạch cho bản” đã dừng")
    expect(r.text).toContain("Lý do: chiến dịch đã kết thúc nhận ủng hộ.")
    expect(r.text).toContain("Give sẽ không tạo mã ủng hộ mới và không nhắc bạn")
    expect(r.text).toContain("mẫu chuyển tiền tới tài khoản Vietcombank •••• 6789")
    expect(r.text).toContain("hãy xóa mẫu đó")
    expect(r.text).toContain(`${ORIGIN}/campaigns/nuoc-sach`)
    expect(r.text).not.toContain("/plans/stop")
    expect(r.oneClickUnsubscribeUrl).toBeNull()
    expect(r.text).not.toMatch(FORBIDDEN)
  })

  it("still asks to delete a template when the account is unknown", () => {
    const r = renderEmail(plan("plan_ended", { ended_reason: "donor_cancelled" }), ORIGIN)
    expect(r.text).toContain("Lý do: bạn đã dừng kế hoạch.")
    expect(r.text).toContain("mẫu chuyển tiền tới tài khoản nhận của chiến dịch")
  })
})

describe("renderEmail: plan_account_swapped (DOS/Give#291)", () => {
  const SIGNED = `${"cd".repeat(32)}.${"A".repeat(21)}w`
  const swap = (payload: Record<string, unknown> = {}, overrides: Partial<OutboxEmail> = {}) =>
    email({
      kind: "plan_account_swapped",
      category: "notification",
      tracking_token: null,
      reference_code: null,
      unsubscribe_token: UNSUB,
      stop_token: "cd".repeat(32),
      payload: {
        campaign_id: CAMPAIGN,
        campaign_slug: "nuoc-sach",
        campaign_title: "Nước sạch cho bản",
        campaign_type: "give",
        plan_id: "33333333-3333-4333-8333-333333333333",
        swap_request_id: "55555555-5555-4555-8555-555555555555",
        new_binding_id: "66666666-6666-4666-8666-666666666666",
        changed_at: "2026-11-22T09:00:00Z",
        changed_date: "2026-11-22",
        new_channel: "statement_import",
        new_bank_bin: "970422",
        new_chain: null,
        new_account_name: "NGUYEN MINH TAM",
        new_account_last4: "0002",
        new_account_masked: "****0002",
        old_bank_bin: "970436",
        old_account_last4: "0001",
        old_account_masked: "****0001",
        ...payload,
      },
      ...overrides,
    })
  const FORBIDDEN = /quá hạn|nợ|còn thiếu/i

  it("states holder name, bank, masked last 4 digits, swap date, campaign link, stop link and unsubscribe without asking to transfer", () => {
    const r = renderEmail(swap(), ORIGIN, { signedStopToken: SIGNED })
    expect(r.subject).toBe("Tài khoản nhận của chiến dịch “Nước sạch cho bản” đã thay đổi")
    expect(r.text).toContain("Ngày 22/11/2026, Give đã duyệt thay đổi tài khoản nhận")
    expect(r.text).toContain(
      "Tài khoản nhận mới: chủ tài khoản NGUYEN MINH TAM, ngân hàng MBBank, số tài khoản •••• 0002."
    )
    expect(r.text).toContain("không yêu cầu bạn chuyển tiền")
    expect(r.text).toContain("tài khoản cũ Vietcombank •••• 0001")
    expect(r.text).toContain(`Xem trang chiến dịch: ${ORIGIN}/campaigns/nuoc-sach`)
    const stop = `${ORIGIN}/plans/stop?t=${encodeURIComponent(SIGNED)}`
    const unsub = `${ORIGIN}/email/unsubscribe?t=${UNSUB}`
    expect(r.text).toContain(`Không muốn nhận lời nhắc nữa? Dừng ủng hộ hằng tháng: ${stop}`)
    expect(r.text).toContain(`Không muốn nhận các email thông báo như thế này? Hủy đăng ký: ${unsub}`)
    expect(r.text).not.toContain("email tổng kết")
    expect(r.html).toContain(`href="${stop}"`)
    expect(r.html).toContain(`href="${unsub}"`)
    expect(r.unsubscribeUrl).toBe(unsub)
    expect(r.oneClickUnsubscribeUrl).toBe(`${ORIGIN}/api/plans/stop?t=${encodeURIComponent(SIGNED)}`)
    expect(r.text).not.toMatch(FORBIDDEN)
    expect(r.text.split("\n--\n")[0]).not.toMatch(/\d{6,}/)
    expect(r.html).not.toMatch(/<img|<link|url\(/i)
  })

  it("formats changed_at in Vietnam time when changed_date is absent and falls back cleanly on missing optional fields", () => {
    const r = renderEmail(
      swap({
        changed_date: null,
        changed_at: "2026-11-22T18:30:00Z", // 2026-11-23 01:30 Asia/Ho_Chi_Minh
        campaign_slug: null,
        old_bank_bin: null,
        old_account_last4: null,
        old_account_masked: null,
      }),
      ORIGIN,
      { signedStopToken: SIGNED }
    )
    expect(r.text).toContain("Ngày 23/11/2026")
    expect(r.text).toContain("tài khoản cũ của chiến dịch")
    expect(r.text).toContain(`${ORIGIN}/me/contributions`)
  })

  it("supports crypto channel formatting with masked last 4 characters", () => {
    const r = renderEmail(
      swap({
        new_channel: "crypto",
        new_bank_bin: null,
        new_account_name: null,
        new_chain: "polygon",
        new_account_last4: "a9F2",
        new_account_masked: "****a9F2",
      }),
      ORIGIN,
      { signedStopToken: SIGNED }
    )
    expect(r.text).toContain("Ví nhận mới trên mạng polygon: •••• a9F2.")
  })

  it("never renders raw multi-digit account numbers even from a malformed payload and escapes HTML", () => {
    const r = renderEmail(
      swap({
        new_account_name: 'TAM <script>alert("x")</script>',
        new_account_last4: "291000220002",
        new_account_masked: "291000220002",
        old_account_last4: "291000110001",
        old_account_masked: "291000110001",
      }),
      ORIGIN,
      { signedStopToken: SIGNED }
    )
    expect(r.text).not.toContain("291000220002")
    expect(r.text).not.toContain("291000110001")
    expect(r.html).not.toContain("291000220002")
    expect(r.html).not.toContain("<script>")
    expect(r.html).toContain("&lt;script&gt;")
  })

  it("refuses plan_account_swapped without a signed stop token or without an unsubscribe token", () => {
    expect(() => renderEmail(swap(), ORIGIN)).toThrow(new EmailRenderError("stop_token_missing"))
    expect(() => renderEmail(swap({}, { unsubscribe_token: null }), ORIGIN, { signedStopToken: SIGNED })).toThrow(
      new EmailRenderError("unsubscribe_token_missing")
    )
  })
})

describe("pledge_account_swapped email (DOS/Give#92)", () => {
  const pledgeSwap = (payload: Record<string, unknown> = {}, overrides: Partial<OutboxEmail> = {}) =>
    email({
      kind: "pledge_account_swapped",
      category: "transactional",
      unsubscribe_token: null,
      stop_token: null,
      reference_code: "GV92ABC23",
      payload: {
        campaign_slug: "den-ngu-go",
        campaign_title: "Đèn ngủ gỗ",
        reference_code: "GV92ABC23",
        intended_amount: 500_000,
        received_amount: 150_000,
        refunded_amount: 50_000,
        payment_due_at: "2026-11-29T03:00:00Z",
        changed_date: "2026-11-22",
        new_channel: "statement_import",
        new_bank_bin: "970422",
        new_account_name: "NGUYEN THI DAO",
        new_account_last4: "0002",
        new_account_masked: "****0002",
        old_bank_bin: "970436",
        old_account_last4: "0001",
        old_account_masked: "****0001",
        public_note: "Ngân hàng đã đóng tài khoản cũ.",
        ...payload,
      },
      ...overrides,
    })

  it("renders transactional payment-account change email with masked details, net due, deadline and pledge link", () => {
    const r = renderEmail(pledgeSwap(), ORIGIN)
    expect(r.subject).toBe("Tài khoản nhận thanh toán của dự án “Đèn ngủ gỗ” đã thay đổi")
    expect(r.unsubscribeUrl).toBeNull()
    expect(r.oneClickUnsubscribeUrl).toBeNull()
    expect(r.text).toContain("Ngày 22/11/2026")
    expect(r.text).toContain("chủ tài khoản NGUYEN THI DAO")
    expect(r.text).toContain("ngân hàng MBBank")
    expect(r.text).toContain("số tài khoản •••• 0002")
    expect(r.text).toContain("Ghi chú công khai: Ngân hàng đã đóng tài khoản cũ.")
    expect(r.text).toContain(formatVnd(400_000))
    expect(r.text).toContain("29/11/2026")
    expect(r.text).toContain("GV92ABC23")
    expect(r.text).toContain("Đừng chuyển tiền vào tài khoản cũ Vietcombank •••• 0001")
    expect(r.text).toContain(`${ORIGIN}/me/pledges/GV92ABC23`)
    expect(r.text).not.toContain("/email/unsubscribe")
    expect(r.text).not.toContain("/plans/stop")
  })

  it("falls back to /me/contributions when reference_code is missing or invalid and supports crypto", () => {
    const r = renderEmail(
      pledgeSwap(
        {
          reference_code: "../evil",
          new_channel: "crypto",
          new_bank_bin: null,
          new_account_name: null,
          new_chain: "polygon",
          new_account_last4: "a9F2",
          public_note: null,
        },
        { reference_code: null }
      ),
      ORIGIN
    )
    expect(r.text).toContain("Ví nhận mới trên mạng polygon: •••• a9F2.")
    expect(r.text).toContain(`${ORIGIN}/me/contributions`)
    expect(r.text).not.toContain("../evil")
  })

  it("never leaks raw multi-digit account numbers, escapes HTML, and strips CR/LF from subject", () => {
    const r = renderEmail(
      pledgeSwap({
        campaign_title: "Đèn\r\nBcc: evil@example.com",
        new_account_name: 'DAO <script>alert("x")</script>',
        public_note: '<img src=x onerror="alert(1)">',
        new_account_last4: "920002220002",
        new_account_masked: "920002220002",
        old_account_last4: "920001110001",
        old_account_masked: "920001110001",
      }),
      ORIGIN
    )
    expect(r.subject).not.toMatch(/[\r\n]/)
    expect(r.text).not.toContain("920002220002")
    expect(r.text).not.toContain("920001110001")
    expect(r.html).not.toContain("920002220002")
    expect(r.html).not.toContain("<script>")
    expect(r.html).not.toContain("<img")
    expect(r.html).toContain("&lt;script&gt;")
    expect(r.html).toContain("&lt;img")
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
