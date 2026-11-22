import { describe, expect, it } from "vitest"

import type { CampaignStatus } from "./campaigns"
import { formatVnd } from "./format"
import type { MoneyTotals } from "./statement"
import {
  ANONYMOUS_DONOR_CARD_LABEL,
  buildOgCampaignCardModel,
  buildThankYouCardModel,
  DEFAULT_DONOR_CARD_LABEL,
  displayShortUrl,
  encodeQrMatrix,
  formatPosterBankHint,
  isOgEligible,
  isThankYouCardEligible,
  resolveThankYouDonorName,
  shouldIncludePosterVietQr,
  truncateCodePoints,
  verifiedStatementLabel,
} from "./viral-sharing"

function totalsFixture(overrides: Partial<MoneyTotals> = {}): MoneyTotals {
  return {
    campaign_id: "33333333-3333-4333-8333-333333333333",
    type: "give",
    asset: "VND",
    goal_amount: 100_000_000,
    pledged_amount: 0,
    paid_amount: 45_000_000,
    disbursable_amount: 45_000_000,
    disbursed_amount: 10_000_000,
    refunded_amount: 0,
    unexplained_out_amount: 0,
    unexplained_out_count: 0,
    supporters_count: 18,
    other_in_amount: 5_000_000,
    refund_owed_amount: 0,
    backers_count: 0,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
    ...overrides,
  }
}

describe("OG card eligibility and formatting (DOS/Give#313)", () => {
  it.each(["live", "settling", "succeeded", "failed", "closed"] as const)(
    "allows public campaign status %s",
    (status) => {
      expect(isOgEligible({ status })).toBe(true)
    }
  )

  it.each(["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"] as const)(
    "rejects non-public campaign status %s",
    (status) => {
      expect(isOgEligible({ status })).toBe(false)
      expect(
        buildOgCampaignCardModel({
          campaign: {
            slug: "test",
            type: "give",
            status,
            title: "Chiến dịch thử nghiệm",
            goal_amount: 50_000_000,
            display_options: { progress_bar: true, backers_count: true, time_remaining: true },
          },
          totals: totalsFixture(),
          organizer: null,
        })
      ).toBeNull()
    }
  )

  it("formats give campaign figures excluding other_in_amount and shows verified statement badge when clean", () => {
    const model = buildOgCampaignCardModel({
      campaign: {
        slug: "xay-truong-ban-may",
        type: "give",
        status: "live",
        title: "Xây trường Bản Mây",
        goal_amount: 100_000_000,
        display_options: { progress_bar: true, backers_count: true, time_remaining: true },
      },
      totals: totalsFixture({ paid_amount: 45_000_000, other_in_amount: 5_000_000, supporters_count: 18 }),
      organizer: { display_name: "Quỹ Bản Mây", verification_status: "verified" },
    })!

    expect(model).not.toBeNull()
    expect(model.typeBadge).toBe("Từ thiện")
    expect(model.statusBadge).toBeNull()
    // Raised excludes other_in_amount: 45M - 5M = 40M (40%).
    expect(model.raised).toBe(40_000_000)
    expect(model.raisedText).toBe(formatVnd(40_000_000))
    expect(model.goalText).toBe(`Mục tiêu ${formatVnd(100_000_000)}`)
    expect(model.percent).toBe(40)
    expect(model.raisedLabel).toBe("Đã nhận")
    expect(model.supportersText).toBe("18 người ủng hộ")
    expect(model.organizerVerified).toBe(true)
    expect(model.verifiedStatementBadge).toBe("Sao kê đối chiếu ngân hàng")
  })

  it("formats opted-in future pre-launch campaigns as teaser OG cards without raised/statement figures (DOS/Give#315)", () => {
    const now = new Date("2026-11-22T00:00:00Z")
    expect(isOgEligible({ status: "approved", prelaunch_public: true, starts_at: "2026-12-01T00:00:00Z" }, now)).toBe(
      true
    )
    expect(isOgEligible({ status: "approved", prelaunch_public: true, starts_at: "2026-11-20T00:00:00Z" }, now)).toBe(
      false
    )

    const model = buildOgCampaignCardModel({
      campaign: {
        slug: "sap-ra-mat",
        type: "give",
        status: "approved",
        prelaunch_public: true,
        starts_at: "2026-12-01T00:00:00Z",
        title: "Thư viện vùng cao",
        goal_amount: 80_000_000,
        display_options: { progress_bar: true, backers_count: true, time_remaining: true },
      },
      totals: null,
      organizer: { display_name: "Quỹ Bản Mây", verification_status: "verified" },
      now,
    })!

    expect(model).not.toBeNull()
    expect(model.isPrelaunch).toBe(true)
    expect(model.statusBadge).toBe("Sắp ra mắt")
    expect(model.verifiedStatementBadge).toBeNull()
    expect(model.showProgressBar).toBe(false)
    expect(model.raisedLabel).toBe("Mục tiêu gây quỹ")
    expect(model.raisedText).toBe(formatVnd(80_000_000))
    expect(model.footerText).toContain("Đăng ký nhận thông báo khi mở")
  })

  it("formats back campaigns with pledged amounts and hides verified statement badge when unexplained outflows exist", () => {
    const model = buildOgCampaignCardModel({
      campaign: {
        slug: "sach-anh-viet-nam",
        type: "back",
        status: "succeeded",
        title: "Sách ảnh Việt Nam",
        goal_amount: 50_000_000,
        display_options: { progress_bar: true, backers_count: true, time_remaining: true },
      },
      totals: totalsFixture({
        type: "back",
        pledged_amount: 60_000_000,
        paid_amount: 40_000_000,
        backers_count: 42,
        unexplained_out_count: 2,
      }),
      organizer: { display_name: "Nhóm Sách Ảnh", verification_status: "verified" },
    })!

    expect(model.typeBadge).toBe("Dự án")
    expect(model.statusBadge).toBe("Thành công")
    expect(model.raised).toBe(60_000_000)
    expect(model.percent).toBe(100)
    expect(model.raisedLabel).toBe("Đã cam kết")
    expect(model.supportersText).toBe("42 người đồng hành")
    expect(model.verifiedStatementBadge).toBeNull()
    expect(verifiedStatementLabel(null, null)).toBeNull()
    // Zero-inflow campaign shows "Sao kê công khai" rather than claiming bank-reconciled inflows.
    expect(
      verifiedStatementLabel(totalsFixture({ paid_amount: 0, unexplained_out_count: 0 }), {
        verification_status: "verified",
      })
    ).toBe("Sao kê công khai")
  })

  it("truncates long titles safely by Unicode code points without splitting surrogate pairs", () => {
    const emojiTitle = `🌱 ${"Chiến dịch hỗ trợ trẻ em vùng cao ".repeat(5)}`
    const truncated = truncateCodePoints(emojiTitle, 40)
    expect(Array.from(truncated).length).toBeLessThanOrEqual(40)
    expect(truncated.endsWith("…")).toBe(true)
    expect(truncated).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })
})

describe("Poster #93 payment-stopped gating and account masking (DOS/Give#313)", () => {
  const NOW = new Date("2026-11-22T12:00:00.000Z")
  const liveGive = {
    type: "give" as const,
    status: "live" as CampaignStatus,
    starts_at: "2026-11-01T00:00:00.000Z",
    ends_at: "2026-12-31T00:00:00.000Z",
    payments_stopped_at: null as string | null,
  }

  it("allows VietQR only for a live give campaign inside dates with no payments_stopped_at and a usable account", () => {
    expect(
      shouldIncludePosterVietQr({
        campaign: liveGive,
        totals: { payments_stopped_at: null },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(true)
  })

  it("strictly suppresses VietQR whenever payments_stopped_at is set on campaign or totals (#93)", () => {
    expect(
      shouldIncludePosterVietQr({
        campaign: { ...liveGive, payments_stopped_at: "2026-11-20T00:00:00.000Z" },
        totals: { payments_stopped_at: null },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)

    expect(
      shouldIncludePosterVietQr({
        campaign: liveGive,
        totals: { payments_stopped_at: "2026-11-20T00:00:00.000Z" },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)

    // Defense-in-depth: fail closed when totals is null and campaign omits payments_stopped_at.
    expect(
      shouldIncludePosterVietQr({
        campaign: {
          type: "give",
          status: "live",
          starts_at: liveGive.starts_at,
          ends_at: liveGive.ends_at,
        },
        totals: null,
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)
  })

  it("suppresses VietQR for non-live, back, out-of-window, or account-less campaigns", () => {
    expect(
      shouldIncludePosterVietQr({
        campaign: liveGive,
        totals: { payments_stopped_at: null },
        hasUsableAccount: false,
        now: NOW,
      })
    ).toBe(false)

    expect(
      shouldIncludePosterVietQr({
        campaign: { ...liveGive, type: "back" },
        totals: { payments_stopped_at: null },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)

    for (const status of [
      "draft",
      "in_review",
      "approved",
      "settling",
      "succeeded",
      "failed",
      "closed",
      "suspended",
      "cancelled",
    ] as const) {
      expect(
        shouldIncludePosterVietQr({
          campaign: { ...liveGive, status },
          totals: { payments_stopped_at: null },
          hasUsableAccount: true,
          now: NOW,
        })
      ).toBe(false)
    }

    expect(
      shouldIncludePosterVietQr({
        campaign: { ...liveGive, starts_at: "2026-12-01T00:00:00.000Z" },
        totals: { payments_stopped_at: null },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)

    expect(
      shouldIncludePosterVietQr({
        campaign: { ...liveGive, ends_at: "2026-11-21T00:00:00.000Z" },
        totals: { payments_stopped_at: null },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)

    // Pre-launch approved campaign with future starts_at MUST suppress VietQR (DOS/Give#315).
    expect(
      shouldIncludePosterVietQr({
        campaign: { ...liveGive, status: "approved", starts_at: "2026-12-01T00:00:00.000Z" },
        totals: { payments_stopped_at: null },
        hasUsableAccount: true,
        now: NOW,
      })
    ).toBe(false)
  })

  it("masks bank account numbers strictly via maskedAccountLast4 and never leaks raw digits", () => {
    expect(formatPosterBankHint("970436", "0011012345678")).toEqual({
      bankName: "Vietcombank",
      maskedAccount: "•••• 5678",
    })
    expect(formatPosterBankHint("970407", "1234")).toEqual({
      bankName: "Techcombank",
      maskedAccount: "••••",
    })
    expect(formatPosterBankHint("970407", null)).toEqual({
      bankName: "Techcombank",
      maskedAccount: "••••",
    })
    expect(formatPosterBankHint("970407", "bad!@#acct")).toEqual({
      bankName: "Techcombank",
      maskedAccount: "••••",
    })
  })

  it("encodes valid square QR matrices and formats short display URLs", () => {
    const qr = encodeQrMatrix("https://give.vn/campaigns/xay-truong")
    expect(qr.size).toBeGreaterThanOrEqual(21)
    expect(qr.bits).toHaveLength(qr.size * qr.size)
    expect(/^[01]+$/.test(qr.bits)).toBe(true)

    expect(displayShortUrl("https://give.vn", "/campaigns/xay-truong")).toBe("give.vn/campaigns/xay-truong")
    expect(displayShortUrl(undefined, "/campaigns/xay-truong")).toBe("give.vn/campaigns/xay-truong")
  })
})

describe("Thank-You Card eligibility, anonymity, and amount-privacy toggle (DOS/Give#313)", () => {
  it("allows only matched/received donations and paid pledges on public campaigns", () => {
    expect(
      isThankYouCardEligible({ kind: "donation", status: "received", receivedAmount: 250_000, hasPublicCampaign: true })
    ).toBe(true)
    expect(
      isThankYouCardEligible({ kind: "pledge", status: "paid", receivedAmount: 500_000, hasPublicCampaign: true })
    ).toBe(true)

    expect(
      isThankYouCardEligible({
        kind: "donation",
        status: "awaiting_transfer",
        receivedAmount: 0,
        hasPublicCampaign: true,
      })
    ).toBe(false)
    expect(
      isThankYouCardEligible({ kind: "donation", status: "expired", receivedAmount: 0, hasPublicCampaign: true })
    ).toBe(false)
    expect(
      isThankYouCardEligible({
        kind: "donation",
        status: "received",
        receivedAmount: 250_000,
        hasPublicCampaign: false,
      })
    ).toBe(false)
    expect(
      isThankYouCardEligible({ kind: "pledge", status: "pledged", receivedAmount: 0, hasPublicCampaign: true })
    ).toBe(false)
    expect(
      isThankYouCardEligible({ kind: "pledge", status: "refunded", receivedAmount: 0, hasPublicCampaign: true })
    ).toBe(false)
    expect(isThankYouCardEligible({ kind: "pledge", status: "paid", receivedAmount: 0, hasPublicCampaign: true })).toBe(
      false
    )
  })

  it("respects anonymous donations even when publicName or fallbackName is provided", () => {
    expect(resolveThankYouDonorName({ publicName: "Nguyễn Minh", isAnonymous: true, fallbackName: "Minh" })).toBe(
      ANONYMOUS_DONOR_CARD_LABEL
    )
    expect(resolveThankYouDonorName({ publicName: "Nguyễn Minh", isAnonymous: false })).toBe("Nguyễn Minh")
    expect(resolveThankYouDonorName({ publicName: "   ", isAnonymous: false, fallbackName: "Trần An" })).toBe("Trần An")
    expect(resolveThankYouDonorName({ publicName: null, isAnonymous: false, fallbackName: null })).toBe(
      DEFAULT_DONOR_CARD_LABEL
    )
  })

  it("shows VND amount clearly by default and completely strips VND digits when hideAmount is true", () => {
    const base = {
      kind: "donation" as const,
      referenceCode: "gvabcdefg",
      amount: 350_000,
      campaignTitle: "Bữa trưa cho em",
      campaignSlug: "bua-trua-cho-em",
      campaignType: "give" as const,
      donorName: "Nguyễn Minh",
      isAnonymous: false,
      createdAt: "2026-11-20T03:00:00.000Z",
      origin: "https://give.vn",
    }

    const visible = buildThankYouCardModel(base, { hideAmount: false })
    expect(visible.headline).toBe("Tôi đã chung tay")
    expect(visible.donorName).toBe("Nguyễn Minh")
    expect(visible.amountText).toBe(formatVnd(350_000))
    expect(visible.referenceCode).toBe("GVABCDEFG")
    expect(visible.statementUrlText).toBe("give.vn/campaigns/bua-trua-cho-em/statement")

    const hidden = buildThankYouCardModel(base, { hideAmount: true })
    expect(hidden.amountText).toBeNull()
    expect(hidden.amountCaption).toContain("ẩn số tiền")
    expect(JSON.stringify(hidden)).not.toContain("350.000")
    expect(JSON.stringify(hidden)).not.toContain("350000")
  })
})
