import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  approvalBlock,
  campaignHasPaymentsDue,
  campaignsWithPaymentsDue,
  canAskSwap,
  describeAccountChange,
  lastDecidedSwap,
  listPublicAccountChanges,
  pendingSwap,
  REVIEW_COLUMNS,
  transactionCounts,
  type AccountSwapRequest,
  type PublicAccountChange,
  type SwapForReview,
} from "./account-swaps"
import type { Db } from "./campaigns"

function request(id: string, status: AccountSwapRequest["status"]): AccountSwapRequest {
  return {
    id,
    campaign_id: "c",
    old_binding_id: "b",
    new_receiving_account_id: "a",
    new_binding_id: status === "approved" ? "nb" : null,
    reason: "r",
    status,
    decided_at: status === "pending" ? null : "2026-11-02T00:00:00Z",
    decision_note: null,
    public_note: null,
    created_at: "2026-11-01T00:00:00Z",
  }
}

describe("canAskSwap", () => {
  it("offers a swap for live or suspended give and back campaigns (DOS/Give#55, #92)", () => {
    for (const type of ["give", "back"] as const) {
      expect(canAskSwap("live", type, false)).toBe(true)
      expect(canAskSwap("suspended", type, false)).toBe(true)
    }
  })

  it("offers it under changes_requested only when the account holds money history", () => {
    for (const type of ["give", "back"] as const) {
      expect(canAskSwap("changes_requested", type, true)).toBe(true)
      expect(canAskSwap("changes_requested", type, false)).toBe(false)
    }
  })

  it("offers it to a succeeded back campaign only while pledges still have payments due (DOS/Give#92)", () => {
    expect(canAskSwap("succeeded", "back", false, true)).toBe(true)
    expect(canAskSwap("succeeded", "back", true, false)).toBe(false)
    expect(canAskSwap("succeeded", "give", true, true)).toBe(false)
  })

  it("never offers it to other statuses", () => {
    for (const status of ["draft", "in_review", "approved", "settling", "failed", "closed", "cancelled"] as const) {
      expect(canAskSwap(status, "give", true, true)).toBe(false)
      expect(canAskSwap(status, "back", true, true)).toBe(false)
    }
  })
})

describe("campaignHasPaymentsDue and campaignsWithPaymentsDue (DOS/Give#92)", () => {
  it("queries active payment_due/partially_paid pledges past payments_stopped_at or now", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: "p-1" }] }), calls)
    expect(await campaignHasPaymentsDue(db as unknown as Db, "c-1", "2026-11-10T00:00:00Z")).toBe(true)
    expect(calls[0].target).toBe("contributions")
    expect(calls[0].ops).toContainEqual(["eq", "campaign_id", "c-1"])
    expect(calls[0].ops).toContainEqual(["eq", "kind", "pledge"])
    expect(calls[0].ops).toContainEqual(["in", "status", ["payment_due", "partially_paid"]])
    expect(calls[0].ops).toContainEqual(["gt", "payment_due_at", "2026-11-10T00:00:00Z"])
  })

  it("batches unique succeeded back campaigns and returns only those with payments due", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => ({ data: op(call, "eq")?.[1] === "c-1" ? [{ id: "p-1" }] : [] }), calls)
    const due = await campaignsWithPaymentsDue(db as unknown as Db, [
      { id: "c-1", payments_stopped_at: null },
      { id: "c-2", payments_stopped_at: "2026-11-10T00:00:00Z" },
      { id: "c-1", payments_stopped_at: null },
    ])
    expect([...due]).toEqual(["c-1"])
    expect(calls).toHaveLength(2)
  })
})

describe("pendingSwap and lastDecidedSwap", () => {
  it("pick the pending request and the newest decided one (the list is newest first)", () => {
    const list = [request("p", "pending"), request("r", "rejected"), request("a", "approved")]
    expect(pendingSwap(list)?.id).toBe("p")
    expect(lastDecidedSwap(list)?.id).toBe("r")
    expect(pendingSwap([request("c", "cancelled")])).toBeNull()
  })
})

function review(overrides: Partial<SwapForReview> = {}): SwapForReview {
  return {
    ...request("p", "pending"),
    campaign: {
      id: "c",
      slug: "quy",
      title: "Quỹ",
      status: "live",
      type: "give",
    },
    new_account: {
      id: "a",
      owner_user_id: "o",
      channel: "statement_import",
      bank_bin: "970436",
      account_number: "0002",
      account_name: "NGUYEN THI DAO",
      verification_status: "verified",
      review_note: null,
      organizer: { legal_name: "Nguyễn Thị Đào", display_name: "Đào", verification_status: "verified" },
    },
    old_binding: { id: "b", bound_at: "2026-10-01T00:00:00Z", released_at: null, account: null },
    ...overrides,
  }
}

describe("approvalBlock", () => {
  it("lets a request that still describes an eligible give or back campaign be approved", () => {
    expect(approvalBlock(review(), 3)).toBeNull()
    expect(approvalBlock(review({ campaign: { ...review().campaign!, type: "back", status: "live" } }), 0)).toBeNull()
    expect(
      approvalBlock(review({ campaign: { ...review().campaign!, type: "back", status: "suspended" } }), 0)
    ).toBeNull()
    expect(
      approvalBlock(review({ campaign: { ...review().campaign!, type: "back", status: "succeeded" } }), 0, true)
    ).toBeNull()
  })

  it("explains a stale request", () => {
    expect(approvalBlock(review({ campaign: { ...review().campaign!, status: "closed" } }), 3)).toContain(
      "không còn ở trạng thái"
    )
    expect(
      approvalBlock(review({ campaign: { ...review().campaign!, type: "back", status: "succeeded" } }), 3, false)
    ).toContain("không còn cam kết nào đang chờ thanh toán")
    expect(
      approvalBlock(review({ campaign: { ...review().campaign!, type: "back", status: "failed" } }), 3, true)
    ).toContain("không còn ở trạng thái")
    expect(
      approvalBlock(review({ old_binding: { ...review().old_binding!, released_at: "2026-11-02T00:00:00Z" } }), 3)
    ).toContain("đã thay đổi")
    expect(approvalBlock(review({ campaign: { ...review().campaign!, status: "changes_requested" } }), 0)).toContain(
      "tự nhả"
    )
    expect(
      approvalBlock(review({ campaign: { ...review().campaign!, type: "back", status: "changes_requested" } }), 0)
    ).toContain("tự nhả")
    expect(
      approvalBlock(review({ new_account: { ...review().new_account!, verification_status: "disabled" } }), 3)
    ).toContain("Tài khoản mới")
    expect(
      approvalBlock(
        review({
          new_account: {
            ...review().new_account!,
            organizer: { ...review().new_account!.organizer!, verification_status: "pending" },
          },
        }),
        3
      )
    ).toContain("Hồ sơ người tổ chức")
  })
})

describe("REVIEW_COLUMNS", () => {
  it("never reads campaigns.organizer_id, which authenticated may not select", () => {
    const campaignEmbed = /campaign:campaigns\(([^)]*)\)/.exec(REVIEW_COLUMNS)?.[1]
    expect(campaignEmbed).toBe("id, slug, title, status, type, payments_stopped_at")
    expect(campaignEmbed).not.toContain("organizer_id")
    expect(REVIEW_COLUMNS).toContain("new_account:receiving_accounts(id, owner_user_id,")
    expect(REVIEW_COLUMNS).toContain("organizer:organizers(legal_name, display_name, verification_status)")
    expect(REVIEW_COLUMNS).toContain("account_bindings!account_swap_requests_old_binding_id_fkey")
  })
})

describe("transactionCounts", () => {
  it("counts each binding's transactions exactly, without reading rows", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => ({ count: op(call, "eq")?.[1] === "b1" ? 1500 : 0 }), calls)
    const counts = await transactionCounts(db as unknown as Db, ["b1", "b2", "b1"])
    expect([...counts]).toEqual([
      ["b1", 1500],
      ["b2", 0],
    ])
    expect(calls).toHaveLength(2)
    expect(op(calls[0], "select")).toEqual(["id", { count: "exact", head: true }])
  })
})

const change: PublicAccountChange = {
  id: "s",
  campaign_id: "c",
  changed_at: "2026-11-02T03:30:00Z",
  old_channel: "statement_import",
  old_bank_bin: "970436",
  old_chain: null,
  old_account_masked: "****0001",
  new_channel: "statement_import",
  new_bank_bin: "970422",
  new_chain: null,
  new_account_masked: "****0002",
  public_note: null,
}

describe("describeAccountChange", () => {
  it("names the date, both banks and masked numbers, and that earlier money stays the campaign's", () => {
    const text = describeAccountChange(change)
    expect(text).toContain("••••0002 thay cho")
    expect(text).toContain("••••0001")
    expect(text).toMatch(/^Từ .*02\/11\/2026/)
    expect(text).toContain("vẫn thuộc chiến dịch")
    expect(text).toContain("tiền chuyển ra khỏi tài khoản cũ sau thời điểm đó")
  })
})

describe("listPublicAccountChanges", () => {
  it("reads the public view of one campaign, oldest first", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [change] }), calls)
    expect(await listPublicAccountChanges(db as unknown as Db, "c")).toEqual([change])
    expect(calls[0].target).toBe("public_account_changes")
    expect(op(calls[0], "eq")).toEqual(["campaign_id", "c"])
    expect(op(calls[0], "order")).toEqual(["changed_at", { ascending: true }])
  })
})
