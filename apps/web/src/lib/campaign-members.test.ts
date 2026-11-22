import { describe, expect, it } from "vitest"

import {
  CO_ORGANIZER_FALLBACK_NAME,
  createInviteSchema,
  DEFAULT_INVITE_EXPIRY_HOURS,
  getMyCampaignRole,
  getMyCampaignRoles,
  invitePath,
  isInvitableStatus,
  listCampaignMemberInvites,
  listCampaignMembers,
  listCampaignPublicTeam,
  listMyWorkspaceCampaigns,
  memberDisplayName,
  memberInitial,
  normalizeInviteToken,
  OWNER_FALLBACK_NAME,
  previewCampaignMemberInvite,
  safeAvatarUrl,
  teamTabHref,
} from "./campaign-members"
import type { Db } from "./campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

function testDb(handler: Handler, calls?: Call[]): Db {
  return fakeDb(handler, calls) as unknown as Db
}

const OWNER = "11111111-1111-4111-8111-111111111111"
const EDITOR = "22222222-2222-4222-8222-222222222222"
const CAMP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const CAMP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const CAMP_STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const VALID_TOKEN = "a".repeat(64)

describe("campaign-members pure helpers", () => {
  it("validates and normalizes 64-char hex invite tokens", () => {
    expect(normalizeInviteToken(`  ${"A1b2".repeat(16)}  `)).toBe("a1b2".repeat(16))
    expect(normalizeInviteToken("a".repeat(63))).toBeNull()
    expect(normalizeInviteToken("a".repeat(65))).toBeNull()
    expect(normalizeInviteToken("g".repeat(64))).toBeNull()
    expect(normalizeInviteToken("../admin")).toBeNull()
    expect(normalizeInviteToken(null)).toBeNull()
  })

  it("builds invitePath and teamTabHref cleanly", () => {
    expect(invitePath(VALID_TOKEN)).toBe(`/invites/${VALID_TOKEN}`)
    expect(teamTabHref(CAMP_A)).toBe(`/me/campaigns/${CAMP_A}?tab=team`)
  })

  it("matches invitable status rules (anything except cancelled and suspended)", () => {
    expect(isInvitableStatus("draft")).toBe(true)
    expect(isInvitableStatus("live")).toBe(true)
    expect(isInvitableStatus("closed")).toBe(true)
    expect(isInvitableStatus("cancelled")).toBe(false)
    expect(isInvitableStatus("suspended")).toBe(false)
  })

  it("neutralizes missing, blank, or DB 'Organizer' / 'Co-organizer' fallback display names", () => {
    expect(memberDisplayName("Minh Anh", "editor")).toBe("Minh Anh")
    expect(memberDisplayName("Co-organizer", "editor")).toBe(CO_ORGANIZER_FALLBACK_NAME)
    expect(memberDisplayName("  co-organizer  ", "editor")).toBe(CO_ORGANIZER_FALLBACK_NAME)
    expect(memberDisplayName("Organizer", "owner")).toBe(OWNER_FALLBACK_NAME)
    expect(memberDisplayName("  organizer  ", "owner")).toBe(OWNER_FALLBACK_NAME)
    expect(memberDisplayName("ORGANIZER", "owner")).toBe(OWNER_FALLBACK_NAME)
    expect(memberDisplayName("Organizer", "editor")).toBe(CO_ORGANIZER_FALLBACK_NAME)
    expect(memberDisplayName(null, "editor")).toBe(CO_ORGANIZER_FALLBACK_NAME)
    expect(memberDisplayName("   ", "owner")).toBe(OWNER_FALLBACK_NAME)
    expect(memberInitial("đặng văn bình", "editor")).toBe("Đ")
    expect(memberInitial(null, "editor")).toBe("Đ")
    expect(memberInitial("Organizer", "owner")).toBe("N")
  })

  it("allows only clean public https:// avatar URLs without credentials, private hosts, IP literals, or control chars", () => {
    expect(safeAvatarUrl("https://cdn.example.vn/avatars/a.jpg")).toBe("https://cdn.example.vn/avatars/a.jpg")
    expect(safeAvatarUrl("http://cdn.example.vn/avatars/a.jpg")).toBeNull()
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull()
    expect(safeAvatarUrl("data:image/svg+xml,<svg/>")).toBeNull()
    expect(safeAvatarUrl("//cdn.example.vn/a.jpg")).toBeNull()
    expect(safeAvatarUrl("https://user:pass@cdn.example.vn/a.jpg")).toBeNull()
    expect(safeAvatarUrl("https://localhost/a.jpg")).toBeNull()
    expect(safeAvatarUrl("https://intranet/a.jpg")).toBeNull()
    expect(safeAvatarUrl("https://127.0.0.1/a.jpg")).toBeNull()
    expect(safeAvatarUrl("https://169.254.169.254/latest")).toBeNull()
    expect(safeAvatarUrl("https://[::1]/a.jpg")).toBeNull()
    expect(safeAvatarUrl(`https://cdn.example.vn/${"a".repeat(2050)}`)).toBeNull()
    expect(safeAvatarUrl("https://cdn.example.vn/a\n.jpg")).toBeNull()
    expect(safeAvatarUrl("https://cdn.example.vn/a\u007f.jpg")).toBeNull()
    expect(safeAvatarUrl(null)).toBeNull()
  })

  it("validates createInviteSchema bounds and defaults", () => {
    const def = createInviteSchema.safeParse({ expires_in_hours: "", note: "  " })
    expect(def.success).toBe(true)
    if (def.success) {
      expect(def.data).toEqual({ expires_in_hours: DEFAULT_INVITE_EXPIRY_HOURS, note: null })
    }

    const ok = createInviteSchema.safeParse({ expires_in_hours: "72", note: "  Gửi Minh  " })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data).toEqual({ expires_in_hours: 72, note: "Gửi Minh" })
    }

    expect(createInviteSchema.safeParse({ expires_in_hours: "0", note: "" }).success).toBe(false)
    expect(createInviteSchema.safeParse({ expires_in_hours: "721", note: "" }).success).toBe(false)
    expect(createInviteSchema.safeParse({ expires_in_hours: "12.5", note: "" }).success).toBe(false)
    expect(createInviteSchema.safeParse({ expires_in_hours: "24", note: "x".repeat(121) }).success).toBe(false)
  })
})

describe("campaign-members DB queries", () => {
  it("chunks my_campaign_roles requests in batches of 200 and ignores unknown roles", async () => {
    const calls: Call[] = []
    const ids = Array.from({ length: 205 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`)
    const db = testDb((call) => {
      if (call.target === "rpc:my_campaign_roles") {
        const argIds = (op(call, "args")?.[0] as { p_campaign_ids?: string[] } | undefined)?.p_campaign_ids ?? []
        return {
          data: [
            { campaign_id: argIds[0], role: "owner" },
            { campaign_id: argIds[1] ?? ids[204], role: "editor" },
            { campaign_id: ids[203], role: "staff" },
          ],
        }
      }
      return undefined
    }, calls)

    const roles = await getMyCampaignRoles(db, ids)
    const rpcCalls = calls.filter((c) => c.target === "rpc:my_campaign_roles")
    expect(rpcCalls).toHaveLength(2)
    expect((op(rpcCalls[0], "args")?.[0] as { p_campaign_ids: string[] }).p_campaign_ids).toHaveLength(200)
    expect((op(rpcCalls[1], "args")?.[0] as { p_campaign_ids: string[] }).p_campaign_ids).toHaveLength(5)
    expect(roles.get(ids[0])).toBe("owner")
    expect(roles.get(ids[1])).toBe("editor")
    expect(roles.has(ids[203])).toBe(false)
  })

  it("reads single campaign role via getMyCampaignRole", async () => {
    const db = testDb((call) => {
      if (call.target === "rpc:my_campaign_roles") return { data: [{ campaign_id: CAMP_A, role: "editor" }] }
      return undefined
    })
    expect(await getMyCampaignRole(db, CAMP_A)).toBe("editor")
    expect(await getMyCampaignRole(db, CAMP_B)).toBeNull()
  })

  it("lists both owned and editor campaigns while excluding unrelated staff-visible rows", async () => {
    const db = testDb((call) => {
      if (call.target === "rpc:my_campaign_roles") {
        return {
          data: [
            { campaign_id: CAMP_A, role: "owner" },
            { campaign_id: CAMP_B, role: "editor" },
          ],
        }
      }
      if (call.target === "rpc:managed_campaigns") {
        return {
          data: [
            { id: CAMP_A, organizer_id: OWNER, created_at: "2026-11-10T00:00:00Z", title: "Owned" },
            { id: CAMP_B, organizer_id: EDITOR, created_at: "2026-11-12T00:00:00Z", title: "Edited" },
            { id: CAMP_STAFF, organizer_id: EDITOR, created_at: "2026-11-15T00:00:00Z", title: "StaffOnly" },
          ],
        }
      }
      return undefined
    })

    const rows = await listMyWorkspaceCampaigns(db, OWNER)
    expect(rows.map((r) => ({ id: r.id, role: r.role }))).toEqual([
      { id: CAMP_B, role: "editor" },
      { id: CAMP_A, role: "owner" },
    ])
  })

  it("reads members, invites, invite preview, and public team through their exact RPC names", async () => {
    const calls: Call[] = []
    const db = testDb((call) => {
      if (call.target === "rpc:list_campaign_members") return { data: [{ user_id: EDITOR, role: "editor" }] }
      if (call.target === "rpc:list_campaign_member_invites")
        return { data: [{ invite_id: "inv-1", status: "pending" }] }
      if (call.target === "rpc:preview_campaign_member_invite") {
        return { data: [{ status: "pending", campaign_id: CAMP_A, campaign_title: "Test" }] }
      }
      if (call.target === "rpc:campaign_public_team") {
        return { data: [{ member_role: "owner", display_name: "Lan" }] }
      }
      return undefined
    }, calls)

    expect(await listCampaignMembers(db, CAMP_A)).toHaveLength(1)
    expect(await listCampaignMemberInvites(db, CAMP_A)).toHaveLength(1)
    expect((await previewCampaignMemberInvite(db, VALID_TOKEN))?.status).toBe("pending")
    expect(await listCampaignPublicTeam(db, CAMP_A)).toHaveLength(1)
    expect(calls.map((c) => c.target)).toEqual([
      "rpc:list_campaign_members",
      "rpc:list_campaign_member_invites",
      "rpc:preview_campaign_member_invite",
      "rpc:campaign_public_team",
    ])
  })
})
