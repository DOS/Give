import type { Db } from "@/lib/campaigns"

/**
 * Give staff roles over the shared Supabase `give` schema (DDL in DOS-Me
 * `supabase/migrations/20261101150000_give_admin_roles.sql`). Only the admin
 * role may call these functions; the database checks it, records an audit
 * row for every change and refuses to remove or demote the last admin.
 */

export const STAFF_ROLES = ["moderator", "finance", "admin"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const ROLE_LABELS: Record<StaffRole, string> = {
  moderator: "Kiểm duyệt viên",
  finance: "Tài chính",
  admin: "Quản trị viên",
}

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  moderator: "Duyệt chiến dịch và xác minh người tổ chức.",
  finance: "Xác minh tài khoản nhận tiền và đối soát.",
  admin: "Toàn quyền kiểm duyệt, cấp và thu quyền nhân sự.",
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value)
}

export function roleLabel(role: string | null | undefined): string {
  return isStaffRole(role) ? ROLE_LABELS[role] : (role ?? "—")
}

export interface StaffMember {
  user_id: string
  role: StaffRole
  created_at: string
  email: string | null
  display_name: string | null
}

export interface RoleChange {
  id: number
  created_at: string
  action: "admin.grant" | "admin.change" | "admin.revoke"
  user_id: string
  user_email: string | null
  actor_id: string | null
  actor_email: string | null
  before_role: string | null
  after_role: string | null
  reason: string | null
}

/** Everyone with a staff role, admins first (admin only). */
export async function listStaff(db: Db): Promise<StaffMember[]> {
  const { data, error } = await db.rpc("list_admins")
  if (error) throw new Error(`list_admins failed: ${error.message}`)
  return (data ?? []) as StaffMember[]
}

/** The latest role changes, newest first (admin only). */
export async function listRoleChanges(db: Db, limit = 50): Promise<RoleChange[]> {
  const { data, error } = await db.rpc("admin_role_history", { p_limit: limit })
  if (error) throw new Error(`admin_role_history failed: ${error.message}`)
  return (data ?? []) as RoleChange[]
}

/** One line describing a role change, e.g. "Kiểm duyệt viên → Tài chính". */
export function describeChange(change: Pick<RoleChange, "action" | "before_role" | "after_role">): string {
  switch (change.action) {
    case "admin.grant":
      return `Cấp quyền ${roleLabel(change.after_role)}`
    case "admin.change":
      return `Đổi quyền ${roleLabel(change.before_role)} → ${roleLabel(change.after_role)}`
    case "admin.revoke":
      return `Thu quyền ${roleLabel(change.before_role)}`
    default:
      return change.action
  }
}
