import Link from "next/link"

import { Logo } from "@/components/layout/Logo"
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
      { href: "/#minh-bach", label: "Tiền đi thẳng vào tài khoản nhận" },
      { href: "/#hai-hinh-thuc", label: "Từ thiện và dự án khác nhau thế nào" },
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
 * Site footer (DOS/Give#95): the sitemap of pages that exist today. About,
 * help and legal pages join it when they are written.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-body">
            Give không giữ tiền: tiền ủng hộ đi thẳng vào tài khoản nhận của từng chiến dịch, và mọi giao dịch đều có
            sao kê công khai.
          </p>
        </div>
        {SECTIONS.map((section) => (
          <nav key={section.title} aria-label={section.title}>
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <ul className="mt-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center py-1 text-body hover:text-ink hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="container-page py-6 text-muted">© {new Date().getFullYear()} Give. Một sản phẩm của DOS.</p>
      </div>
    </footer>
  )
}
