import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { siteOrigin } from "@/lib/auth/origin"
import { getSession } from "@/lib/auth/session"

import "./globals.css"

export const metadata: Metadata = {
  // Absolute base for Open Graph images such as /media/public/... covers; an
  // unset or malformed NEXT_PUBLIC_SITE_URL leaves Next's default.
  metadataBase: ((origin) => (origin ? new URL(origin) : undefined))(siteOrigin()),
  title: { default: "Give – Gây quỹ minh bạch", template: "%s · Give" },
  description: "Gây quỹ từ thiện và dự án sáng tạo, minh bạch từng đồng. Một sản phẩm của DOS.",
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession()

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
                  <Link href="/me/accounts" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Tài khoản nhận
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
