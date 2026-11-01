import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { siteOrigin } from "@/lib/auth/origin"
import { getSession, type Session } from "@/lib/auth/session"
import { countUnreadNotices, unreadBadge } from "@/lib/notices"
import { dbAs } from "@/lib/supabase"

import "./globals.css"

export const metadata: Metadata = {
  // Absolute base for Open Graph images such as /media/public/... covers; an
  // unset or malformed NEXT_PUBLIC_SITE_URL leaves Next's default.
  metadataBase: ((origin) => (origin ? new URL(origin) : undefined))(siteOrigin()),
  title: { default: "Give – Gây quỹ minh bạch", template: "%s · Give" },
  description: "Gây quỹ từ thiện và dự án sáng tạo, minh bạch từng đồng. Một sản phẩm của DOS.",
}

/** The header badge; never fails the page (no badge on any error). */
async function unreadNotices(session: Session): Promise<string | null> {
  try {
    return unreadBadge(await countUnreadNotices(dbAs(session.accessToken), session.user.id))
  } catch {
    return null
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  const unread = session ? await unreadNotices(session) : null

  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-gray-200 bg-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-xl font-bold text-brand-600">
              Give
            </Link>
            <Link href="/campaigns" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Khám phá
            </Link>
            <Link href="/start" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Tạo chiến dịch
            </Link>
            <div className="ml-auto flex items-center gap-4">
              {session ? (
                <>
                  <Link href="/me/campaigns" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Chiến dịch của tôi
                  </Link>
                  <Link href="/me/contributions" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Ủng hộ của tôi
                  </Link>
                  <Link href="/me/accounts" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Tài khoản nhận
                  </Link>
                  <Link
                    href="/me/notices"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
                    aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
                  >
                    Thông báo
                    {unread && (
                      <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs leading-none font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </Link>
                  <span className="hidden text-sm text-gray-500 sm:inline">
                    {session.user.name ?? session.user.email}
                  </span>
                  <form action="/auth/logout" method="post">
                    <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
                      Đăng xuất
                    </button>
                  </form>
                </>
              ) : (
                <a href="/auth/login" className="btn-primary py-1.5">
                  Đăng nhập DOS.Me
                </a>
              )}
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-gray-50">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-gray-500">
            Give không giữ tiền: tiền ủng hộ đi thẳng vào tài khoản nhận của từng chiến dịch. Một sản phẩm của DOS.
          </div>
        </footer>
      </body>
    </html>
  )
}
