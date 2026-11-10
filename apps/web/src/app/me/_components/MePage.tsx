import type { ReactNode } from "react"

import { SectionNav } from "@/components/ui/Tabs"

export type MeSection = "campaigns" | "contributions" | "notices" | "accounts"

const SECTIONS: { key: MeSection; href: string; label: string }[] = [
  { key: "campaigns", href: "/me/campaigns", label: "Chiến dịch của tôi" },
  { key: "contributions", href: "/me/contributions", label: "Ủng hộ của tôi" },
  { key: "notices", href: "/me/notices", label: "Thông báo" },
  { key: "accounts", href: "/me/accounts", label: "Tài khoản nhận tiền" },
]

/**
 * A top-level /me page (DESIGN.md 8): the person's sections as a side
 * navigation from 1024px (3 of 12 columns) and as tabs above the page below
 * that, then the page itself.
 */
export function MePage({ section, children }: { section: MeSection; children: ReactNode }) {
  return (
    <div className="container-page pt-6 pb-16 sm:pt-8 lg:grid lg:grid-cols-12 lg:gap-x-6 lg:pb-24">
      <div className="min-w-0 lg:col-span-3">
        <SectionNav
          label="Trang của tôi"
          items={SECTIONS.map((s) => ({ href: s.href, label: s.label, current: s.key === section }))}
        />
      </div>
      <div className="mt-8 min-w-0 space-y-12 lg:col-span-9 lg:mt-0">{children}</div>
    </div>
  )
}

/**
 * An inner /me page (an editor, a report): the same container, no section
 * navigation. Forms inside keep to 640px (`max-w-160`); a page that has a
 * sidebar lays out its own 8/4 grid.
 */
export function MeDetail({ children }: { children: ReactNode }) {
  return <div className="container-page space-y-12 pt-6 pb-16 sm:pt-8 lg:pb-24">{children}</div>
}
