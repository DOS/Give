import { describe, expect, it } from "vitest"

import {
  accountChoices,
  boundAccountOf,
  canPickAccount,
  SUBMIT_NO_ACCOUNT,
  submitAccountProblem,
  submitUnusableAccount,
} from "./campaign-account"
import type { ReceivingAccount } from "./receiving-accounts"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const OTHER = "44444444-4444-4444-8444-444444444444"
const organizer = { legal_name: "Nguyễn Thị Đào", verification_status: "verified" as const }

function account(id: string, overrides: Partial<ReceivingAccount> = {}): ReceivingAccount {
  return {
    id,
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    channel: "statement_import",
    bank_bin: "970436",
    account_number: "0011012345678",
    account_name: "NGUYEN THI DAO",
    account_kind: "standard",
    public_statement_url: null,
    verification_status: "verified",
    verification_code: "GIVEV123",
    review_note: null,
    verified_at: "2026-11-01T00:00:00Z",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    bindings: [],
    ...overrides,
  }
}

function bound(campaignId: string, released_at: string | null = null) {
  return [{ id: `b-${campaignId}`, campaign_id: campaignId, bound_at: "2026-11-01T00:00:00Z", released_at }]
}

describe("submitAccountProblem", () => {
  it("refuses a campaign with no bound account", () => {
    expect(submitAccountProblem(null, organizer)).toBe(SUBMIT_NO_ACCOUNT)
    expect(SUBMIT_NO_ACCOUNT).toContain("/me/accounts")
  })

  it("refuses a bound account that is not verified or no longer matches the organizer", () => {
    expect(submitAccountProblem(account("a", { verification_status: "disabled" }), organizer)).toBe(
      submitUnusableAccount("Tài khoản chưa được xác minh.")
    )
    expect(submitAccountProblem(account("a"), { ...organizer, verification_status: "pending" })).toMatch(
      /^Chưa gửi duyệt được: tài khoản nhận tiền đang gắn không dùng được\. Hồ sơ người tổ chức/
    )
    expect(submitAccountProblem(account("a"), { ...organizer, legal_name: "Trần Văn B" })).toContain(
      "Tên chủ tài khoản không còn trùng"
    )
  })

  it("passes a verified account in the verified organizer's name", () => {
    expect(submitAccountProblem(account("a"), organizer)).toBeNull()
  })
})

describe("boundAccountOf", () => {
  it("finds the account whose active binding holds the campaign", () => {
    const accounts = [
      account("a", { bindings: bound(CAMPAIGN, "2026-11-01T01:00:00Z") }),
      account("b", { bindings: bound(OTHER) }),
      account("c", { bindings: bound(CAMPAIGN) }),
    ]
    expect(boundAccountOf(accounts, CAMPAIGN)?.id).toBe("c")
    expect(boundAccountOf(accounts.slice(0, 2), CAMPAIGN)).toBeNull()
  })
})

describe("accountChoices", () => {
  const refs = new Map([[OTHER, { title: "Quỹ khác" }]])

  it("lists usable accounts first and explains every other one", () => {
    const choices = accountChoices(
      [
        account("pending", { verification_status: "pending" }),
        account("elsewhere", { bindings: bound(OTHER) }),
        account("rejected", { verification_status: "rejected" }),
        account("free", { bindings: bound(OTHER, "2026-11-01T01:00:00Z") }),
      ],
      CAMPAIGN,
      organizer,
      refs
    )
    expect(choices.map((c) => [c.account.id, c.blockedReason])).toEqual([
      ["free", null],
      ["pending", "Tài khoản đang chờ xác minh."],
      [
        "elsewhere",
        'Tài khoản đang gắn với chiến dịch "Quỹ khác". Mỗi tài khoản chỉ gắn với một chiến dịch; nhả nó ở trang Tài khoản nhận tiền nếu trạng thái chiến dịch kia cho phép.',
      ],
      ["rejected", "Tài khoản không dùng được (bị từ chối hoặc đã khóa)."],
    ])
  })

  it("leaves out the account already bound to this campaign", () => {
    const choices = accountChoices([account("here", { bindings: bound(CAMPAIGN) })], CAMPAIGN, organizer, refs)
    expect(choices).toEqual([])
  })

  it("says a campaign elsewhere holds the account when its title is unknown", () => {
    const [choice] = accountChoices([account("x", { bindings: bound(OTHER) })], CAMPAIGN, organizer, new Map())
    expect(choice.blockedReason).toBe("Tài khoản đang gắn với một chiến dịch khác.")
  })

  it("blocks a verified account once the organizer's identity no longer matches it", () => {
    const [choice] = accountChoices([account("x")], CAMPAIGN, { ...organizer, legal_name: "Trần Văn B" }, refs)
    expect(choice.blockedReason).toContain("Tên chủ tài khoản không còn trùng")
  })
})

describe("canPickAccount", () => {
  it("offers the picker only while the campaign may take an account and has none", () => {
    expect(canPickAccount("draft", null)).toBe(true)
    expect(canPickAccount("changes_requested", null)).toBe(true)
    expect(canPickAccount("draft", account("a"))).toBe(false)
    expect(canPickAccount("cancelled", null)).toBe(false)
  })
})
