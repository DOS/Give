import type { ReactNode } from "react"

import { getSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { AdminNav, type AdminNavLink } from "./_components/AdminNav"

/**
 * The admin section's frame (DESIGN.md 8): the pages this person's role
 * opens as a side navigation from 1024px and tabs below, beside the page.
 * Each page still checks the role itself (and 404s); the tabs are only
 * navigation, so a signed-out or non-staff visitor sees none.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const links = await adminLinks()
  return (
    <div className="container-page pt-6 pb-16 sm:pt-8 lg:grid lg:grid-cols-12 lg:gap-x-6 lg:pb-24">
      {links.length > 0 && (
        <div className="min-w-0 lg:col-span-3">
          <AdminNav links={links} />
        </div>
      )}
      <div className={links.length > 0 ? "mt-8 min-w-0 lg:col-span-9 lg:mt-0" : "min-w-0 lg:col-span-12"}>
        {children}
      </div>
    </div>
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
