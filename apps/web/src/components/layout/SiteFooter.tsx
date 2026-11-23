import Link from "next/link"

import { discoveryHref } from "@/lib/campaigns"
import { GIVE_CONTACT_EMAIL, GIVE_CONTACT_HREF } from "@/lib/contact"

const LINK_ROW = "relative flex min-h-9 w-fit items-center"
const LINK =
  "inline-flex min-h-7 items-center text-muted transition-colors duration-150 before:absolute before:inset-0 before:content-[''] hover:text-fg hover:underline"

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
 * help and legal pages join it when they are written. Under the brand line,
 * "Liên hệ" is the one way to reach Give staff (DOS/Give#205).
 *
 * Each link is a 28px box centred in its 36px row, and the whole row is its
 * hit area (`before`, on the list item), so one-line links sit where they
 * did and their focus ring, 4px outside the box, stays 4px clear of the next
 * link. A link that wraps fills its row, so its ring reaches the next link's
 * box but stays clear of its text (DESIGN.md 6, Focus ring).
 */
export function SiteFooter() {
  return (
    <footer data-site-footer className="border-t border-border bg-bg text-sm">
      <div className="container-page grid grid-cols-2 gap-x-4 gap-y-6 pt-12 pb-8 sm:pt-16 lg:grid-cols-4 lg:gap-x-6">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="text-lg font-bold text-fg">Give</p>
          <p className="mt-2 max-w-[32ch] text-muted">
            Give không giữ tiền. Mọi khoản đóng góp đi thẳng vào tài khoản của chiến dịch.
          </p>
          <p className={`mt-1 ${LINK_ROW}`}>
            <a href={GIVE_CONTACT_HREF} className={LINK}>
              Liên hệ: {GIVE_CONTACT_EMAIL}
            </a>
          </p>
        </div>
        {SECTIONS.map((section) => (
          <nav key={section.title} aria-label={section.title} className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">{section.title}</h2>
            <ul className="mt-1">
              {section.links.map((link) => (
                <li key={link.href} className={LINK_ROW}>
                  <Link href={link.href} className={LINK}>
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
