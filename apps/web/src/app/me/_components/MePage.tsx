import type { ReactNode } from "react"

import { TabNav } from "@/components/ui/Tabs"

export type MeSection = "campaigns" | "contributions" | "notices" | "accounts"

const SECTIONS: { key: MeSection; href: string; label: string }[] = [
  { key: "campaigns", href: "/me/campaigns", label: "Chiến dịch của tôi" },
  { key: "contributions", href: "/me/contributions", label: "Ủng hộ của tôi" },
  { key: "notices", href: "/me/notices", label: "Thông báo" },
  { key: "accounts", href: "/me/accounts", label: "Tài khoản nhận tiền" },
]

/**
 * A top-level /me page (DOS/Give#96): the tabs between the signed-in
 * person's lists, then the page. On phones the tabs scroll sideways.
 */
export function MePage({ section, children }: { section: MeSection; children: ReactNode }) {
  return (
    <div className="container-page pt-4 pb-16 sm:pt-6">
      <TabNav
        label="Trang của tôi"
        items={SECTIONS.map((s) => ({ href: s.href, label: s.label, current: s.key === section }))}
      />
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  )
}

/** An inner /me page (an editor, a report): one centred column, no tabs. */
export function MeDetail({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className={`mx-auto w-full px-4 pt-4 pb-16 sm:px-6 sm:pt-6 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
      <div className="space-y-8">{children}</div>
    </div>
  )
}
