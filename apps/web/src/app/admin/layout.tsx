import type { ReactNode } from "react"

import { ShieldIcon } from "@/components/ui/icons"
import { getSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { AdminNav, type AdminNavLink } from "./_components/AdminNav"

/**
 * The admin section's frame: tabs for the pages this person's role opens.
 * Each page still checks the role itself (and 404s); the tabs are only
 * navigation, so a signed-out or non-staff visitor sees none.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const links = await adminLinks()
  return (
    <>
      {links.length > 0 && (
        <div className="bg-surface">
          <div className="container-page pt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <ShieldIcon width={16} height={16} />
              Quản trị Give
            </p>
            <AdminNav links={links} />
          </div>
        </div>
      )}
      {children}
    </>
  )
}

async function adminLinks(): Promise<AdminNavLink[]> {
  const session = await getSession()
  if (!session) return []
  const db = dbAs(session.accessToken)
  const [moderates, finance, admin] = await Promise.all([
    isStaff(db, MODERATION_ROLES),
    isStaff(db, FINANCE_ROLES),
    isStaff(db, ["admin"]),
  ])
  return [
    ...(moderates
      ? [
          { href: "/admin", label: "Kiểm duyệt" },
          { href: "/admin/evidence", label: "Ảnh chứng từ" },
          { href: "/admin/payment-requests", label: "Thanh toán" },
        ]
      : []),
    ...(finance
      ? [
          { href: "/admin/accounts", label: "Tài khoản nhận" },
          { href: "/admin/account-swaps", label: "Đổi tài khoản" },
          { href: "/admin/statements", label: "Sao kê" },
          { href: "/admin/unmatched", label: "Chưa khớp" },
          { href: "/admin/inbound", label: "Tiền vào bị dừng" },
        ]
      : []),
    ...(admin ? [{ href: "/admin/roles", label: "Phân quyền" }] : []),
  ]
}
