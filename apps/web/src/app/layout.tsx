import type { Metadata } from "next"
import { Be_Vietnam_Pro } from "next/font/google"
import { headers } from "next/headers"
import type { ReactNode } from "react"

import { LayoutShell } from "@/components/layout/LayoutShell"
import { SiteFooter } from "@/components/layout/SiteFooter"
import { SiteHeader } from "@/components/layout/SiteHeader"
import { siteOrigin } from "@/lib/auth/origin"
import { getSession, type Session } from "@/lib/auth/session"
import { countUnreadNotices, unreadBadge } from "@/lib/notices"
import { dbAs } from "@/lib/supabase"

import "./globals.css"

// Be Vietnam Pro: drawn for Vietnamese, so stacked diacritics (ễ, ặ, ỗ) keep
// their spacing at every weight. Self-hosted by next/font, no layout shift.
const font = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-be-vietnam-pro",
})

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
  // Embed widget requests set x-give-embed in proxy.ts and stay strictly anonymous (DOS/Give#335).
  const isEmbed = (await headers()).get("x-give-embed") === "1"
  const session = isEmbed ? null : await getSession()
  const unread = session ? await unreadNotices(session) : null

  return (
    <html lang="vi" className={font.variable}>
      <body className="flex min-h-screen flex-col">
        <LayoutShell
          header={isEmbed ? null : <SiteHeader session={session} unread={unread} />}
          footer={isEmbed ? null : <SiteFooter />}
        >
          {children}
        </LayoutShell>
      </body>
    </html>
  )
}
