import { describe, expect, it } from "vitest"

import type { CampaignStatus } from "@/lib/campaigns"
import type { MoneyTotals } from "@/lib/statement"

import { buildServerPosterData } from "./viral-sharing"

const NOW = new Date("2026-11-22T12:00:00.000Z")

function campaignFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "xay-truong-ban-may",
    type: "give" as const,
    status: "live" as CampaignStatus,
    title: "Xây trường Bản Mây",
    goal_amount: 100_000_000,
    starts_at: "2026-11-01T00:00:00.000Z",
    ends_at: "2026-12-31T00:00:00.000Z",
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    payments_stopped_at: null as string | null,
    ...overrides,
  }
}

function totalsFixture(overrides: Partial<MoneyTotals> = {}): MoneyTotals {
  return {
    campaign_id: "33333333-3333-4333-8333-333333333333",
    type: "give",
    asset: "VND",
    goal_amount: 100_000_000,
    pledged_amount: 0,
    paid_amount: 25_000_000,
    disbursable_amount: 25_000_000,
    disbursed_amount: 0,
    refunded_amount: 0,
    unexplained_out_amount: 0,
    unexplained_out_count: 0,
    supporters_count: 10,
    other_in_amount: 0,
    refund_owed_amount: 0,
    backers_count: 0,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
    ...overrides,
  }
}

const ACCOUNT = {
  bank_bin: "970436",
  account_number: "0011012345678",
  account_name: "NGUYEN VAN SECRET",
}

describe("buildServerPosterData (DOS/Give#313)", () => {
  it("returns null for non-public campaign statuses", () => {
    for (const status of ["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"] as const) {
      expect(
        buildServerPosterData({
          campaign: campaignFixture({ status }),
          totals: totalsFixture(),
          organizer: { display_name: "Quỹ Bản Mây", verification_status: "verified" },
          account: ACCOUNT,
          origin: "https://give.vn",
          now: NOW,
        })
      ).toBeNull()
    }
  })

  it("includes static VietQR matrix with masked bank hint for an eligible live give campaign without leaking raw account fields", () => {
    const poster = buildServerPosterData({
      campaign: campaignFixture(),
      totals: totalsFixture(),
      organizer: { display_name: "Quỹ Bản Mây", verification_status: "verified" },
      account: ACCOUNT,
      origin: "https://give.vn",
      now: NOW,
    })!

    expect(poster).not.toBeNull()
    expect(poster.vietQr).not.toBeNull()
    expect(poster.vietQr?.bankName).toBe("Vietcombank")
    expect(poster.vietQr?.maskedAccount).toBe("•••• 5678")
    expect(poster.vietQr?.qr.size).toBeGreaterThanOrEqual(21)
    expect(poster.vietQr?.qr.bits).toHaveLength(poster.vietQr!.qr.size * poster.vietQr!.qr.size)

    // Anti-leak: neither the raw bank account number nor the account holder's legal name appears in serialized props.
    const serialized = JSON.stringify(poster)
    expect(serialized).not.toContain(ACCOUNT.account_number)
    expect(serialized).not.toContain(ACCOUNT.account_name)
    expect(serialized).not.toContain("001101234")
  })

  it("strictly suppresses VietQR when payments_stopped_at is set on campaign or totals (#93)", () => {
    const stoppedOnCampaign = buildServerPosterData({
      campaign: campaignFixture({ payments_stopped_at: "2026-11-20T00:00:00.000Z" }),
      totals: totalsFixture(),
      organizer: { display_name: "Quỹ Bản Mây", verification_status: "verified" },
      account: ACCOUNT,
      origin: "https://give.vn",
      now: NOW,
    })!
    expect(stoppedOnCampaign.vietQr).toBeNull()

    const stoppedOnTotals = buildServerPosterData({
      campaign: campaignFixture(),
      totals: totalsFixture({ payments_stopped_at: "2026-11-20T00:00:00.000Z" }),
      organizer: { display_name: "Quỹ Bản Mây", verification_status: "verified" },
      account: ACCOUNT,
      origin: "https://give.vn",
      now: NOW,
    })!
    expect(stoppedOnTotals.vietQr).toBeNull()
  })

  it("suppresses VietQR for closed, back, expired, missing-account, or malformed-account campaigns", () => {
    expect(
      buildServerPosterData({
        campaign: campaignFixture({ status: "closed" }),
        totals: totalsFixture(),
        organizer: null,
        account: ACCOUNT,
        now: NOW,
      })!.vietQr
    ).toBeNull()

    expect(
      buildServerPosterData({
        campaign: campaignFixture({ type: "back" }),
        totals: totalsFixture({ type: "back" }),
        organizer: null,
        account: ACCOUNT,
        now: NOW,
      })!.vietQr
    ).toBeNull()

    expect(
      buildServerPosterData({
        campaign: campaignFixture(),
        totals: totalsFixture(),
        organizer: null,
        account: null,
        now: NOW,
      })!.vietQr
    ).toBeNull()

    expect(
      buildServerPosterData({
        campaign: campaignFixture(),
        totals: totalsFixture(),
        organizer: null,
        account: { bank_bin: "invalid", account_number: "0123456789", account_name: "TEST" },
        now: NOW,
      })!.vietQr
    ).toBeNull()
  })
})
