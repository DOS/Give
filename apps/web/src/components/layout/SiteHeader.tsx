import Link from "next/link"

import { Disclosure } from "@/components/layout/Disclosure"
import { Logo } from "@/components/layout/Logo"
import { NavLink } from "@/components/layout/NavLink"
import { buttonClass } from "@/components/ui/Button"
import { BellIcon, ChevronDownIcon, CloseIcon, MenuIcon, SearchIcon } from "@/components/ui/icons"
import type { Session } from "@/lib/auth/session"

const iconButton =
  "relative inline-flex size-11 items-center justify-center rounded text-fg transition-colors duration-150 hover:bg-surface"
const menuLink = "flex min-h-11 items-center rounded px-3 text-base text-fg hover:bg-surface"

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
          placeholder="Tìm chiến dịch, dự án"
          className="field min-h-10 py-1.5 pl-10"
        />
      </div>
    </form>
  )
}

/**
 * Site header (DESIGN.md 7): 64px, sticky, on the page container. The logo
 * on the left, search in the middle (a sheet on phones), then "Khám phá",
 * "Tạo chiến dịch" and the account menu or "Đăng nhập". Below 1024px the
 * links move into the menu panel.
 */
export function SiteHeader({ session, unread }: { session: Session | null; unread: string | null }) {
  const name = session ? (session.user.name ?? session.user.email ?? "Tài khoản") : null

  const notices = session && (
    <Link href="/me/notices" className={iconButton} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}>
      <BellIcon width={24} height={24} />
      {unread && (
        <span className="absolute top-1 right-0.5 min-w-5 rounded bg-accent px-1 text-center text-xs leading-5 font-semibold text-bg">
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
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-bg px-4 py-2 font-medium text-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Chuyển tới nội dung chính
      </a>
      <nav aria-label="Chính" className="container-page flex h-16 items-center gap-4 lg:gap-8">
        <Logo />

        <SearchForm id="site-search" className="hidden max-w-[480px] min-w-0 flex-1 md:block" />

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <NavLink href="/campaigns">Khám phá</NavLink>
          <Link href="/start" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Tạo chiến dịch
          </Link>
          {notices}
          {session ? (
            <Disclosure
              label={`Tài khoản: ${name}`}
              buttonClassName="inline-flex h-9 max-w-48 items-center gap-1 rounded px-3 text-sm font-semibold text-fg hover:bg-surface"
              button={
                <>
                  <span className="truncate">{name}</span>
                  <ChevronDownIcon width={16} height={16} />
                </>
              }
              panelClassName="absolute right-0 mt-2 w-60 card p-2 shadow-float"
            >
              <Link href="/me/campaigns" className={menuLink}>
                Chiến dịch của tôi
              </Link>
              <Link href="/me/contributions" className={menuLink}>
                Ủng hộ của tôi
              </Link>
              <Link href="/me/accounts" className={menuLink}>
                Tài khoản nhận
              </Link>
              <div className="my-1 border-t border-border" />
              {logout}
            </Disclosure>
          ) : (
            <a href="/auth/login" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Đăng nhập
            </a>
          )}
        </div>

        <div className="ml-auto flex items-center lg:hidden">
          <Disclosure
            label="Tìm kiếm"
            openLabel="Đóng tìm kiếm"
            className="md:hidden"
            buttonClassName={iconButton}
            button={<SearchIcon width={24} height={24} />}
            openButton={<CloseIcon width={24} height={24} />}
            panelClassName="fixed inset-x-0 top-16 border-b border-border bg-bg shadow-float"
          >
            <div className="container-page py-4">
              <SearchForm id="sheet-search" />
            </div>
          </Disclosure>
          {notices}
          <Disclosure
            label="Mở menu"
            openLabel="Đóng menu"
            buttonClassName={iconButton}
            button={<MenuIcon width={24} height={24} />}
            openButton={<CloseIcon width={24} height={24} />}
            panelClassName="fixed inset-x-0 top-16 bottom-0 overflow-y-auto border-t border-border bg-bg"
          >
            <div className="container-page space-y-6 py-6">
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
              <div className="border-t border-border pt-6">
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
