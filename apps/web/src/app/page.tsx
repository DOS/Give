import Link from "next/link"
import type { ReactNode } from "react"

import { CampaignCard } from "@/components/CampaignCard"
import { FeaturedReceipt } from "@/components/home/FeaturedReceipt"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { EyeIcon, HeartIcon, LedgerIcon, ShieldIcon, SparkIcon } from "@/components/ui/icons"
import { DEFAULT_DISCOVERY, discoveryHref, listCategories, listPublicCampaigns } from "@/lib/campaigns"
import { homeSections } from "@/lib/home"
import { listMoneyTotals, raisedAmount } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

const LOGIN_ERRORS: Record<string, string> = {
  denied: "Bạn đã hủy đăng nhập.",
  state: "Phiên đăng nhập đã hết hạn. Hãy thử lại.",
  tokens: "Không nhận được phiên đăng nhập từ DOS.Me. Hãy thử lại.",
  exchange: "Đăng nhập DOS.Me không thành công. Hãy thử lại.",
  unavailable: "Đăng nhập DOS.Me chưa được cấu hình trên môi trường này.",
}

/** How many live campaigns the home page loads: one featured, three for "Đang được quan tâm", the rest spare. */
const HOME_CAMPAIGNS = 10

/** Cards in "Đang được quan tâm" (DESIGN.md 8). */
const INTERESTING = 3

/**
 * Home (DESIGN.md 8): hero with the statement card, "Đang được quan tâm",
 * "Hai cách gây quỹ", the trust strip and the organizer band. Each section
 * has one heading and one action.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ login_error?: string }> }) {
  const { login_error: loginError } = await searchParams
  const db = dbAs()
  const categories = await listCategories(db)
  const { campaigns } = await listPublicCampaigns(
    db,
    { ...DEFAULT_DISCOVERY, sort: "newest" },
    categories,
    HOME_CAMPAIGNS
  )
  const totals = await listMoneyTotals(
    db,
    campaigns.map((c) => c.id)
  )
  const { featured, trending, newest } = homeSections(campaigns, totals)
  // Closest to their goal first, topped up with the newest so the row is full.
  const interesting = [...trending, ...newest].slice(0, INTERESTING)

  return (
    <>
      {loginError && (
        <div role="alert" className="bg-danger-soft py-3 text-danger">
          <p className="container-page">
            {Object.hasOwn(LOGIN_ERRORS, loginError) ? LOGIN_ERRORS[loginError] : LOGIN_ERRORS.exchange}
          </p>
        </div>
      )}

      <section className="border-b border-border">
        <div className="container-page grid-page items-center gap-y-8 py-12 sm:py-16 lg:py-24">
          {/* Eight columns from 1024px (the receipt card keeps 9 to 12), so the headline's second line, about
              560px at 48px, fits from 1024px; the 18ch and 52ch measures still cap the headline and paragraph. */}
          <div className="col-span-full min-w-0 lg:col-span-8">
            <h1 className="max-w-[18ch] text-display-phone tracking-tight sm:text-display">
              Gây quỹ minh&nbsp;bạch, từng đồng đều có sao kê
            </h1>
            <p className="mt-4 max-w-[52ch] text-lg text-muted sm:mt-6">
              Tiền đi thẳng vào tài khoản của chiến dịch. Give ghi lại từng giao dịch và công khai cho mọi người cùng
              xem.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:mt-8 sm:flex-row sm:items-center sm:gap-6">
              {/* With no live campaign, discovery would open an empty list: the one action is to create one. */}
              {campaigns.length === 0 ? (
                <ButtonLink href="/start" size="lg" className="max-sm:w-full">
                  Tạo chiến dịch của bạn
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/campaigns" size="lg" className="max-sm:w-full">
                    Khám phá chiến dịch
                  </ButtonLink>
                  <Link href="/start" className="inline-flex min-h-11 items-center justify-center link">
                    Tạo chiến dịch của bạn
                  </Link>
                </>
              )}
            </div>
          </div>
          {featured && (
            <div className="col-span-full min-w-0 sm:col-span-6 md:col-span-5 lg:col-span-4 lg:col-start-9">
              <FeaturedReceipt campaign={featured} totals={totals.get(featured.id)} />
            </div>
          )}
        </div>
      </section>

      {campaigns.length === 0 ? (
        <section className="container-page pt-16 lg:pt-24">
          {/* No button of its own: the hero above already offers "Tạo chiến dịch của bạn" (DESIGN.md 8). */}
          <EmptyState title="Chưa có chiến dịch nào đang gây quỹ" level={2} flush>
            Chiến dịch hiện ở đây ngay khi được duyệt.
          </EmptyState>
        </section>
      ) : (
        interesting.length > 0 && (
          <section aria-labelledby="quan-tam-heading" className="container-page pt-16 lg:pt-24">
            {/* Phones get the 14px link from the HomeMobile mockup, so the heading keeps one line beside it
                from 375px. Below that the link wraps under the heading instead of breaking the heading.
                The link is one line of text with an invisible 44px hit area, so from 375px the row is as
                tall as the heading and the cards sit 24px below it; below 375px the wrapped link sits 8px
                under the heading and the cards 24px below the link. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
              <h2 id="quan-tam-heading" className="text-h2">
                Đang được quan tâm
              </h2>
              <Link href="/campaigns" className="hit-area shrink-0 text-sm link whitespace-nowrap sm:text-base">
                Xem tất cả
              </Link>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {interesting.map((campaign, index) => {
                const t = totals.get(campaign.id)
                return (
                  // Two columns from 640px show two cards, so no card sits alone on a row.
                  <div key={campaign.id} className={index === 2 ? "min-w-0 sm:max-lg:hidden" : "min-w-0"}>
                    <CampaignCard
                      campaign={campaign}
                      raised={raisedAmount(t, campaign.type)}
                      people={t ? (campaign.type === "give" ? t.supporters_count : t.backers_count) : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        )
      )}

      <section
        id="hai-hinh-thuc"
        aria-labelledby="hai-cach-heading"
        className="container-page scroll-mt-20 pt-16 lg:pt-24"
      >
        <h2 id="hai-cach-heading" className="text-h2">
          Hai cách gây quỹ trên Give
        </h2>
        <div className="mt-6 grid gap-4 sm:gap-6 md:grid-cols-2">
          <Way
            icon={<HeartIcon width={24} height={24} />}
            tone="primary"
            title="Từ thiện"
            href={discoveryHref({ type: "give" })}
            link="Xem chiến dịch từ thiện"
          >
            Góp bất kỳ số tiền nào bằng VietQR. Tiền vào thẳng tài khoản của chiến dịch, và người tổ chức phải giải
            trình từng khoản chi.
          </Way>
          <Way
            icon={<SparkIcon width={24} height={24} />}
            tone="accent"
            title="Dự án sáng tạo"
            href={discoveryHref({ type: "back" })}
            link="Xem dự án sáng tạo"
          >
            Chọn một mức ủng hộ và nhận quà từ người làm dự án. Bạn chỉ chuyển tiền khi dự án đạt mục tiêu.
          </Way>
        </div>
      </section>

      <section
        id="minh-bach"
        aria-labelledby="minh-bach-heading"
        className="container-page scroll-mt-20 py-16 lg:py-24"
      >
        <h2 id="minh-bach-heading" className="sr-only">
          Vì sao tiền trên Give minh bạch
        </h2>
        <ul className="grid gap-8 md:grid-cols-3 md:gap-6">
          <TrustPoint icon={<ShieldIcon width={24} height={24} />} title="Give không giữ tiền">
            Mỗi chiến dịch có tài khoản riêng đã xác minh. Tiền không đi qua Give.
          </TrustPoint>
          <TrustPoint icon={<LedgerIcon width={24} height={24} />} title="Sao kê công khai">
            Mọi khoản tiền vào và ra đều hiện trên trang sao kê của chiến dịch.
          </TrustPoint>
          <TrustPoint icon={<EyeIcon width={24} height={24} />} title="Chi tiêu phải giải trình">
            Khoản chi chưa có giải trình được đánh dấu công khai cho tới khi người tổ chức giải trình.
          </TrustPoint>
        </ul>
      </section>

      <section aria-labelledby="to-chuc-heading" className="border-t border-border bg-surface">
        <div className="container-page flex flex-col gap-6 py-12 sm:py-16 md:flex-row md:items-center md:justify-between md:gap-8">
          <div className="min-w-0">
            <h2 id="to-chuc-heading" className="text-h2">
              Bạn có một việc cần gây quỹ?
            </h2>
            <p className="mt-2 text-muted">Tạo chiến dịch trong vài phút. Tiền về thẳng tài khoản của bạn.</p>
          </div>
          <ButtonLink href="/start" size="lg" className="shrink-0 max-md:w-full">
            Tạo chiến dịch
          </ButtonLink>
        </div>
      </section>
    </>
  )
}

/** One of the two ways to raise money: a surface panel with an icon, an H3, one short paragraph and one link. */
function Way({
  icon,
  tone,
  title,
  href,
  link,
  children,
}: {
  icon: ReactNode
  tone: "primary" | "accent"
  title: string
  href: string
  link: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-md bg-surface p-6 lg:p-8">
      <span
        className={`inline-flex size-11 items-center justify-center rounded ${tone === "primary" ? "bg-primary-soft text-primary" : "bg-accent-soft text-accent"}`}
      >
        {icon}
      </span>
      <h3 className="mt-4 text-h3">{title}</h3>
      <p className="mt-2 max-w-[46ch] text-muted">{children}</p>
      <Link href={href} className="mt-2 inline-flex min-h-11 items-center link">
        {link}
      </Link>
    </div>
  )
}

function TrustPoint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="min-w-0">
      <span className="text-primary">{icon}</span>
      <h3 className="mt-3 text-h3">{title}</h3>
      <p className="mt-2 text-muted">{children}</p>
    </li>
  )
}
