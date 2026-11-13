import Link from "next/link"

import { discoveryHref } from "@/lib/campaigns"

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Gây quỹ",
    links: [
      { href: "/campaigns", label: "Khám phá chiến dịch" },
      { href: discoveryHref({ type: "give" }), label: "Từ thiện" },
      { href: discoveryHref({ type: "back" }), label: "Dự án sáng tạo" },
      { href: "/start", label: "Tạo chiến dịch" },
    ],
  },
  {
    title: "Minh bạch",
    links: [
      { href: "/#minh-bach", label: "Tiền đi thẳng vào tài khoản" },
      { href: "/#hai-hinh-thuc", label: "Hai cách gây quỹ" },
    ],
  },
  {
    title: "Tài khoản",
    links: [
      { href: "/me/campaigns", label: "Chiến dịch của tôi" },
      { href: "/me/contributions", label: "Ủng hộ của tôi" },
      { href: "/me/accounts", label: "Tài khoản nhận" },
    ],
  },
]

/**
 * Site footer (DESIGN.md 7): the sitemap of pages that exist today, 4
 * columns from 1024px and 2 below, then the bottom line in Small. About,
 * help and legal pages join it when they are written.
 *
 * Links are 28px boxes 8px apart (a 36px pitch), each with an invisible
 * 36px hit area (`before`), so the focus ring, 4px outside the box, stays
 * clear of the next link (DESIGN.md 6, Focus ring).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg text-sm">
      <div className="container-page grid grid-cols-2 gap-x-4 gap-y-6 pt-12 pb-8 sm:pt-16 lg:grid-cols-4 lg:gap-x-6">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="text-lg font-bold text-fg">Give</p>
          <p className="mt-2 max-w-[32ch] text-muted">
            Give không giữ tiền. Mọi khoản đóng góp đi thẳng vào tài khoản của chiến dịch.
          </p>
        </div>
        {SECTIONS.map((section) => (
          <nav key={section.title} aria-label={section.title} className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">{section.title}</h2>
            <ul className="mt-1 flex flex-col gap-2 py-1">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="relative inline-flex min-h-7 items-center text-muted transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:text-fg hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-page">
        <p className="border-t border-border pt-6 pb-12 text-muted">
          © {new Date().getFullYear()} Give · Một sản phẩm của DOS
        </p>
      </div>
    </footer>
  )
}
