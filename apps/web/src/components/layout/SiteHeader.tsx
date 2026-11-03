import Link from "next/link"

import { Disclosure } from "@/components/layout/Disclosure"
import { Logo } from "@/components/layout/Logo"
import { buttonClass } from "@/components/ui/Button"
import { BellIcon, ChevronDownIcon, CloseIcon, MenuIcon, SearchIcon } from "@/components/ui/icons"
import type { Session } from "@/lib/auth/session"

const navLink =
  "inline-flex min-h-11 items-center rounded px-3 text-base font-medium text-body hover:bg-surface hover:text-ink"
const menuLink = "flex min-h-11 items-center rounded px-3 text-base text-ink hover:bg-surface"

/** The search box: a plain GET to discovery, so it works before hydration. */
function SearchForm({ id, className }: { id: string; className?: string }) {
  return (
    <form action="/campaigns" method="get" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        Tìm chiến dịch
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          id={id}
          name="q"
          type="search"
          maxLength={80}
          placeholder="Tìm chiến dịch, dự án, người tổ chức"
          className="field bg-surface pl-10"
        />
      </div>
    </form>
  )
}

/**
 * Site header (DOS/Give#95): search-centric like Kickstarter, three
 * destinations (Khám phá, Tạo chiến dịch, Chiến dịch của tôi) and sign-in.
 * The signed-in extras (contributions, receiving accounts, sign-out) sit in
 * the account menu; on phones everything is in the menu panel.
 */
export function SiteHeader({ session, unread }: { session: Session | null; unread: string | null }) {
  const name = session ? (session.user.name ?? session.user.email ?? "Tài khoản") : null

  const notices = session && (
    <Link
      href="/me/notices"
      className="relative inline-flex size-11 items-center justify-center rounded text-body hover:bg-surface hover:text-ink"
      aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
    >
      <BellIcon width={22} height={22} />
      {unread && (
        <span className="absolute top-1.5 right-1 min-w-5 rounded-sm bg-accent-700 px-1 text-center text-xs leading-5 font-semibold text-white">
          {unread}
        </span>
      )}
    </Link>
  )

  const logout = (
    <form action="/auth/logout" method="post">
      <button type="submit" className={`${menuLink} w-full text-left`}>
        Đăng xuất
      </button>
    </form>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-4 py-2 font-medium text-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <nav aria-label="Chính" className="container-page flex h-16 items-center gap-2 lg:gap-4">
        <Logo />

        <SearchForm id="site-search" className="mx-2 hidden max-w-md flex-1 md:block lg:mx-4" />

        <div className="ml-auto hidden items-center gap-1 lg:flex">
          <Link href="/campaigns" className={navLink}>
            Khám phá
          </Link>
          <Link href="/start" className={navLink}>
            Tạo chiến dịch
          </Link>
          {session && (
            <Link href="/me/campaigns" className={navLink}>
              Chiến dịch của tôi
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <Link
            href="/campaigns"
            className="inline-flex size-11 items-center justify-center rounded text-ink hover:bg-surface md:hidden"
            aria-label="Tìm chiến dịch"
          >
            <SearchIcon width={22} height={22} />
          </Link>
          {notices}
          {session ? (
            <Disclosure
              label={`Tài khoản: ${name}`}
              className="hidden lg:block"
              buttonClassName="inline-flex min-h-11 max-w-48 items-center gap-1 rounded px-3 text-base font-medium text-ink hover:bg-surface"
              button={
                <>
                  <span className="truncate">{name}</span>
                  <ChevronDownIcon width={18} height={18} />
                </>
              }
              panelClassName="absolute right-0 mt-2 w-60 card p-2 shadow-lg"
            >
              <Link href="/me/contributions" className={menuLink}>
                Ủng hộ của tôi
              </Link>
              <Link href="/me/accounts" className={menuLink}>
                Tài khoản nhận
              </Link>
              <div className="my-1 border-t border-line" />
              {logout}
            </Disclosure>
          ) : (
            <a href="/auth/login" className={buttonClass({ variant: "secondary", className: "hidden lg:inline-flex" })}>
              Đăng nhập
            </a>
          )}

          <Disclosure
            label="Mở menu"
            openLabel="Đóng menu"
            className="lg:hidden"
            buttonClassName="inline-flex size-11 items-center justify-center rounded text-ink hover:bg-surface"
            button={<MenuIcon width={24} height={24} />}
            openButton={<CloseIcon width={24} height={24} />}
            panelClassName="fixed inset-x-0 top-16 bottom-0 overflow-y-auto border-t border-line bg-white"
          >
            <div className="container-page space-y-6 py-6">
              <SearchForm id="menu-search" className="md:hidden" />
              <ul className="space-y-1">
                <li>
                  <Link href="/campaigns" className={menuLink}>
                    Khám phá chiến dịch
                  </Link>
                </li>
                <li>
                  <Link href="/start" className={menuLink}>
                    Tạo chiến dịch
                  </Link>
                </li>
                {session && (
                  <>
                    <li>
                      <Link href="/me/campaigns" className={menuLink}>
                        Chiến dịch của tôi
                      </Link>
                    </li>
                    <li>
                      <Link href="/me/contributions" className={menuLink}>
                        Ủng hộ của tôi
                      </Link>
                    </li>
                    <li>
                      <Link href="/me/accounts" className={menuLink}>
                        Tài khoản nhận
                      </Link>
                    </li>
                    <li>
                      <Link href="/me/notices" className={menuLink}>
                        Thông báo{unread ? ` (${unread} chưa đọc)` : ""}
                      </Link>
                    </li>
                  </>
                )}
              </ul>
              <div className="border-t border-line pt-6">
                {session ? (
                  <>
                    <p className="px-3 pb-2 text-muted">Đang đăng nhập: {name}</p>
                    {logout}
                  </>
                ) : (
                  <a href="/auth/login" className={buttonClass({ full: true })}>
                    Đăng nhập bằng DOS.Me
                  </a>
                )}
              </div>
            </div>
          </Disclosure>
        </div>
      </nav>
    </header>
  )
}
