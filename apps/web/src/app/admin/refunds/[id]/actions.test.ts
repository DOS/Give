import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF = "66666666-6666-4666-8666-666666666666"
const ORGANIZER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "33333333-3333-4333-8333-333333333333"
const CONTRIBUTION = "55555555-5555-4555-8555-555555555555"
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
  email: null as string | null,
}))

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: STAFF, email: state.email, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
  MEDIA_BUCKET: "give-media",
}))
vi.mock("@/lib/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media")>()),
  reencodeCover: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

const { recordStaffRefund } = await import("./actions")

// The organizer gave to their own campaign; finance records the refund to it.
const campaign = { id: CAMPAIGN, organizer_id: ORGANIZER, slug: "quy-a", title: "Quỹ A", status: "live" }
const tx = { id: TX, campaign_id: CAMPAIGN, amount: 300_000, asset: "VND", booked_at: "2026-11-01T02:00:00Z" }
const organizersContribution = {
  id: CONTRIBUTION,
  reference_code: "GVABCDEF2",
  received_amount: 500_000,
  contributor_user_id: ORGANIZER,
  guest_email: null,
}

function reads({
  staff = true,
  camp = campaign as unknown,
  outgoing = tx as unknown,
  disbursement = null as unknown,
  returned = null as unknown,
  contribution = organizersContribution as unknown,
  refunds = [] as unknown[],
  error = null as { code?: string; message?: string } | null,
} = {}): Handler {
  return (call) => {
    if (call.target === "rpc:is_admin") return { data: staff }
    if (error) return { error }
    if (call.target === "rpc:managed_campaigns") return { data: camp }
    if (call.target === "bank_transactions")
      return { data: outgoing ? { ...(outgoing as object), disbursement, returned } : null }
    if (call.target === "contributions") return { data: contribution }
    if (call.target === "ledger_entries") return { data: refunds }
    return undefined
  }
}

const recordsNew: Handler = (call) =>
  call.target === "rpc:record_disbursement" ? { data: { outcome: "refunded", replayed: false } } : undefined

function form(values: Record<string, string> = {}, files: File[] = []) {
  const f = new FormData()
  const all = {
    purpose: "Hoàn lại khoản ủng hộ của người tổ chức",
    recipient: "",
    refund_contribution_id: CONTRIBUTION,
    evidence_kind: "receipt",
    ...values,
  }
  for (const [k, v] of Object.entries(all)) f.set(k, v)
  for (const file of files) f.append("evidence", file)
  return f
}

const png = (name = "bien-nhan.png") => new File([new Uint8Array(PNG)], name, { type: "image/png" })

const uploads = () => state.serviceCalls.filter((c) => c.target === "storage:give-media" && op(c, "upload"))
const removes = () => state.serviceCalls.filter((c) => c.target === "storage:give-media" && op(c, "remove"))
const rpc = (name: string) => state.serviceCalls.find((c) => c.target === `rpc:${name}`)

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.email = null
  state.userHandler = reads()
  state.serviceHandler = recordsNew
  revalidatePath.mockClear()
})

describe("recordStaffRefund", () => {
  it("checks the role and reads everything with the staff token, then records the refund as the service role", async () => {
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form({ recipient: "Người tổ chức" }, [png()]))
    expect(result).toEqual({ ok: true, message: expect.stringContaining("Đã ghi khoản 300.000") })

    // The role check is the first call, with the actor's own token.
    expect(state.userCalls[0].target).toBe("rpc:is_admin")
    expect(op(state.userCalls[0], "args")).toEqual([{ p_roles: ["finance", "admin"] }])
    expect(state.userCalls.map((c) => c.target)).toEqual(
      expect.arrayContaining(["rpc:managed_campaigns", "bank_transactions", "contributions", "ledger_entries"])
    )

    const [path, , options] = op(uploads()[0], "upload")!
    expect(path).toMatch(new RegExp(`^disbursements/${CAMPAIGN}/${TX}/[0-9a-f-]{36}\\.webp$`))
    expect(options).toMatchObject({ contentType: "image/webp", upsert: false })
    expect(op(rpc("record_disbursement"), "args")?.[0]).toEqual({
      p_bank_transaction_id: TX,
      p_actor_id: STAFF,
      p_purpose: "Hoàn lại khoản ủng hộ của người tổ chức",
      p_category: "refund",
      p_recipient: "Người tổ chức",
      p_is_refund: true,
      p_refund_contribution_id: CONTRIBUTION,
      p_evidence: [{ storage_path: path, kind: "receipt" }],
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/refunds/${CAMPAIGN}`)
    expect(revalidatePath).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}/disbursements`)
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/quy-a/statement")
  })

  it("always books the refund category, whatever the form sends", async () => {
    await recordStaffRefund(CAMPAIGN, TX, null, form({ category: "goods" }))
    expect(op(rpc("record_disbursement"), "args")?.[0]).toMatchObject({ p_category: "refund", p_is_refund: true })
  })

  it("refuses anyone who is not finance or admin staff before reading or writing anything else", async () => {
    state.userHandler = reads({ staff: false })
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result).toEqual({
      ok: false,
      message: "Chỉ nhân viên tài chính hoặc quản trị viên ghi được khoản hoàn tiền cho chiến dịch.",
    })
    expect(state.userCalls.map((c) => c.target)).toEqual(["rpc:is_admin"])
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a signed-out visitor without any call", async () => {
    state.signedIn = false
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form())
    expect(result?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("stops when the staff token cannot read (an expired or forged session)", async () => {
    state.userHandler = reads({ error: { code: "PGRST301", message: "JWT expired" } })
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form())
    expect(result?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("uses the organizer form's validation: a purpose and a contribution are required", async () => {
    expect(await recordStaffRefund(CAMPAIGN, TX, null, form({ purpose: "  " }))).toEqual({
      ok: false,
      message: "Ghi mục đích của khoản chi",
    })
    expect(await recordStaffRefund(CAMPAIGN, TX, null, form({ refund_contribution_id: "" }))).toEqual({
      ok: false,
      message: "Khoản hoàn tiền cần chọn lượt ủng hộ được hoàn",
    })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form({ refund_contribution_id: "abc" })))?.ok).toBe(false)
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form({ evidence_kind: "x" })))?.ok).toBe(false)
    expect((await recordStaffRefund("not-a-uuid", TX, null, form()))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("checks the evidence images like the organizer form", async () => {
    const text = new File(["not an image"], "x.txt", { type: "text/plain" })
    expect(await recordStaffRefund(CAMPAIGN, TX, null, form({}, [text]))).toEqual({
      ok: false,
      message: "Chứng từ chỉ nhận ảnh JPEG, PNG hoặc WebP.",
    })
    const six = Array.from({ length: 6 }, (_, i) => png(`${i}.png`))
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form({}, six)))?.message).toBe("Mỗi lần tải tối đa 5 ảnh.")
    expect(uploads()).toHaveLength(0)
    expect(rpc("record_disbursement")).toBeUndefined()
  })

  it("refuses a transfer already explained, returned by the bank, or not of this campaign", async () => {
    state.userHandler = reads({ disbursement: { purpose: "x", evidence: [] } })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form()))?.message).toContain("đã được giải trình")

    state.userHandler = reads({ returned: { linked_at: "2026-11-03T00:00:00Z", back: null } })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form()))?.message).toContain("bị ngân hàng trả lại")

    state.userHandler = reads({ outgoing: null })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form()))?.message).toContain("Không tìm thấy giao dịch")

    state.userHandler = reads({ camp: null })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form()))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words the database's refusal of a move between the campaign's own accounts", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:record_disbursement"
        ? { error: { code: "23514", message: "GIVE_TRANSACTION_OWN_TRANSFER" } }
        : undefined
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result?.message).toContain("chuyển sang tài khoản mới của chiến dịch")
    expect(removes()).toHaveLength(1)
  })

  it("refuses a refund larger than what is left to refund on the contribution (nothing counted twice)", async () => {
    state.userHandler = reads({ refunds: [{ contribution_id: CONTRIBUTION, amount: 300_000 }] })
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("GVABCDEF2")
    expect(result?.message).toContain("200.000")
    expect(uploads()).toHaveLength(0)
    expect(rpc("record_disbursement")).toBeUndefined()

    // Fully refunded already: the contribution is no longer refundable.
    state.userHandler = reads({ refunds: [{ contribution_id: CONTRIBUTION, amount: 500_000 }] })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form()))?.message).toContain("đã được hoàn hết")
  })

  it("refuses a refund to the staff member's own contribution, signed in or by guest email, before any upload", async () => {
    state.email = "Tai.Chinh@Give.vn"
    state.userHandler = reads({
      contribution: { ...organizersContribution, contributor_user_id: null, guest_email: " tai.chinh@give.VN " },
    })
    const guest = await recordStaffRefund(CAMPAIGN, TX, null, form({}, [png()]))
    expect(guest?.ok).toBe(false)
    expect(guest?.message).toContain("Bạn không ghi được khoản hoàn tiền cho lượt ủng hộ của chính mình")
    expect(guest?.message).toContain("Nhờ một nhân viên tài chính khác")
    expect(uploads()).toHaveLength(0)

    state.userHandler = reads({ contribution: { ...organizersContribution, contributor_user_id: STAFF } })
    expect((await recordStaffRefund(CAMPAIGN, TX, null, form()))?.message).toContain("Nhờ một nhân viên tài chính khác")
    expect(rpc("record_disbursement")).toBeUndefined()
  })

  it("words the database's GIVE_SELF_REVIEW for staff and removes the upload", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:record_disbursement" ? { error: { code: "42501", message: "GIVE_SELF_REVIEW" } } : undefined
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result?.message).toContain("Nhờ một nhân viên tài chính khác")
    expect(result?.message).not.toContain("tài khoản nhận")
    expect(removes()).toHaveLength(1)
  })

  it("removes the images of a repeated submission when the database reports a replay", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:record_disbursement" ? { data: { outcome: "refunded", replayed: true } } : undefined
    const result = await recordStaffRefund(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result).toEqual({
      ok: true,
      message: "Khoản chuyển này đã được ghi là hoàn tiền từ trước. Ảnh vừa tải không được lưu.",
    })
    expect(removes()).toHaveLength(1)
  })
})
