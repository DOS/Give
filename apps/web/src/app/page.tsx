import Link from "next/link"
import type { ReactNode } from "react"

import { CampaignCard } from "@/components/CampaignCard"
import { FeaturedReceipt } from "@/components/home/FeaturedReceipt"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { BankIcon, GiftIcon, HeartIcon, LedgerIcon, ShieldIcon, SparkIcon } from "@/components/ui/icons"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { categoriesFor, discoveryHref, listCategories, listPublicCampaigns, type PublicCampaign } from "@/lib/campaigns"
import { homeSections } from "@/lib/home"
import { listMoneyTotals, raisedAmount, type MoneyTotals } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

const LOGIN_ERRORS: Record<string, string> = {
  denied: "Bạn đã hủy đăng nhập.",
  state: "Phiên đăng nhập đã hết hạn. Hãy thử lại.",
  tokens: "Không nhận được phiên đăng nhập từ DOS.Me. Hãy thử lại.",
  exchange: "Đăng nhập DOS.Me không thành công. Hãy thử lại.",
  unavailable: "Đăng nhập DOS.Me chưa được cấu hình trên môi trường này.",
}

/** How many live campaigns the home page loads: one featured, three trending, up to six new. */
const HOME_CAMPAIGNS = 10

export default async function HomePage({ searchParams }: { searchParams: Promise<{ login_error?: string }> }) {
  const { login_error: loginError } = await searchParams
  const db = dbAs()
  const categories = await listCategories(db)
  const campaigns = await listPublicCampaigns(db, { type: null, category: null, q: null }, categories, HOME_CAMPAIGNS)
  const totals = await listMoneyTotals(
    db,
    campaigns.map((c) => c.id)
  )
  const { featured, trending, newest } = homeSections(campaigns, totals)

  return (
    <>
      {loginError && (
        <div role="alert" className="bg-red-50 px-4 py-3 text-center text-red-800">
          {Object.hasOwn(LOGIN_ERRORS, loginError) ? LOGIN_ERRORS[loginError] : LOGIN_ERRORS.exchange}
        </div>
      )}

      <section className="border-b border-line bg-brand-50/60">
        <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_440px] lg:gap-16 lg:py-24">
          <div className="max-w-xl">
            <h1 className="text-[2rem] leading-[1.15] font-bold tracking-tight sm:text-5xl sm:leading-[1.1]">
              Gây quỹ minh bạch, từng đồng đều có sao kê
            </h1>
            <p className="mt-4 text-lg text-body sm:mt-6">
              Ủng hộ chiến dịch từ thiện hoặc đồng hành cùng dự án sáng tạo. Tiền đi thẳng vào tài khoản nhận của chiến
              dịch; Give đối chiếu sao kê của tài khoản đó và công khai từng khoản vào, ra.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href="/campaigns" size="lg">
                Khám phá chiến dịch
              </ButtonLink>
              <Link href="/start" className="inline-flex min-h-11 items-center text-lg link">
                Hoặc tạo chiến dịch của bạn
              </Link>
            </div>
          </div>
          {featured && <FeaturedReceipt campaign={featured} totals={totals.get(featured.id)} />}
        </div>
      </section>

      {campaigns.length === 0 ? (
        <section className="container-page py-16">
          <EmptyState
            title="Chưa có chiến dịch nào đang gây quỹ"
            action={<ButtonLink href="/start">Tạo chiến dịch đầu tiên</ButtonLink>}
          >
            Chiến dịch hiện ở đây ngay khi được duyệt.
          </EmptyState>
        </section>
      ) : (
        <>
          <CampaignGrid id="sap-dat-muc-tieu" title="Sắp đạt mục tiêu" campaigns={trending} totals={totals} />
          <CampaignGrid
            id="moi"
            title="Chiến dịch mới"
            campaigns={newest}
            totals={totals}
            more={<Link href="/campaigns">Xem tất cả chiến dịch</Link>}
          />
        </>
      )}

      <section id="hai-hinh-thuc" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="container-page py-16">
          <SectionHeader title="Hai cách gây quỹ trên Give">
            Mỗi chiến dịch chọn một hình thức. Nhãn trên thẻ cho bạn biết đó là hình thức nào.
          </SectionHeader>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <TypeExplainer
              icon={<HeartIcon width={24} height={24} />}
              tone="brand"
              title="Từ thiện"
              points={[
                "Chọn số tiền bạn muốn góp và chuyển khoản bằng mã VietQR.",
                "Tiền chuyển thẳng vào tài khoản nhận của chiến dịch, không qua Give.",
                "Người tổ chức phải giải trình từng khoản chi; khoản chưa giải trình được đánh dấu công khai.",
              ]}
              links={categoriesFor(categories, "give").map((c) => ({
                href: discoveryHref({ type: "give", category: c.slug }),
                label: c.name,
              }))}
              allHref={discoveryHref({ type: "give" })}
              allLabel="Xem chiến dịch từ thiện"
            />
            <TypeExplainer
              icon={<SparkIcon width={24} height={24} />}
              tone="accent"
              title="Dự án sáng tạo"
              points={[
                "Chọn một mức ủng hộ và nhận quà từ người tạo dự án.",
                "Bạn cam kết trước, chỉ chuyển tiền khi dự án đạt mục tiêu.",
                "Dự án không đạt mục tiêu thì không ai phải trả.",
              ]}
              links={categoriesFor(categories, "back").map((c) => ({
                href: discoveryHref({ type: "back", category: c.slug }),
                label: c.name,
              }))}
              allHref={discoveryHref({ type: "back" })}
              allLabel="Xem dự án sáng tạo"
            />
          </div>
        </div>
      </section>

      <section id="minh-bach" className="scroll-mt-20">
        <div className="container-page space-y-10 py-16">
          <SectionHeader title="Give không giữ tiền của bạn">
            Give là nơi ghi nhận và công khai, không phải ví trung gian. Vì vậy bạn luôn kiểm tra được tiền đã đi đâu.
          </SectionHeader>
          <ul className="grid gap-8 md:grid-cols-3 md:gap-12">
            <TrustPoint icon={<BankIcon width={24} height={24} />} title="Thẳng vào tài khoản nhận">
              Mã VietQR trỏ tới tài khoản ngân hàng đã xác minh của chiến dịch, không qua tài khoản của Give.
            </TrustPoint>
            <TrustPoint icon={<LedgerIcon width={24} height={24} />} title="Sao kê công khai">
              Give đối chiếu sao kê của tài khoản nhận và đưa từng khoản vào, ra lên trang sao kê để ai cũng xem được.
            </TrustPoint>
            <TrustPoint icon={<ShieldIcon width={24} height={24} />} title="Tài khoản nhận đã xác minh">
              Give kiểm tra tài khoản ngân hàng thuộc về người tổ chức trước khi chiến dịch được nhận tiền.
            </TrustPoint>
          </ul>
        </div>
      </section>

      <section className="border-t border-line bg-brand-900 text-white">
        <div className="container-page flex flex-col items-start gap-6 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold text-white">Bạn có một việc tốt hay một ý tưởng cần gây quỹ?</h2>
            <p className="mt-2 text-brand-100">
              Viết câu chuyện, đăng ký tài khoản nhận của bạn và bắt đầu nhận ủng hộ khi chiến dịch được duyệt.
            </p>
          </div>
          <ButtonLink
            href="/start"
            variant="secondary"
            size="lg"
            className="shrink-0 border-white bg-white hover:bg-brand-50 focus-visible:outline-white"
          >
            <GiftIcon width={20} height={20} />
            Tạo chiến dịch
          </ButtonLink>
        </div>
      </section>
    </>
  )
}

function CampaignGrid({
  id,
  title,
  campaigns,
  totals,
  more,
}: {
  id: string
  title: string
  campaigns: readonly PublicCampaign[]
  totals: ReadonlyMap<string, MoneyTotals>
  more?: ReactNode
}) {
  if (campaigns.length === 0) return null
  return (
    <section aria-labelledby={`${id}-heading`} className="container-page py-12 sm:py-16">
      <SectionHeader id={`${id}-heading`} title={title} action={more} />
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            raised={raisedAmount(totals.get(campaign.id), campaign.type)}
          />
        ))}
      </div>
    </section>
  )
}

function TypeExplainer({
  icon,
  tone,
  title,
  points,
  links,
  allHref,
  allLabel,
}: {
  icon: ReactNode
  tone: "brand" | "accent"
  title: string
  points: string[]
  links: { href: string; label: string }[]
  allHref: string
  allLabel: string
}) {
  return (
    <div className="flex flex-col card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex size-11 items-center justify-center rounded ${tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-accent-100 text-accent-800"}`}
        >
          {icon}
        </span>
        <h3 className="text-xl font-bold">{title}</h3>
      </div>
      <ul className="mt-6 space-y-3">
        {points.map((point) => (
          <li key={point} className="flex gap-3">
            <span
              className={`mt-2.5 size-1.5 shrink-0 rounded-sm ${tone === "brand" ? "bg-brand-600" : "bg-accent-700"}`}
              aria-hidden
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      {links.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label={`Danh mục ${title.toLowerCase()}`}>
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center rounded border border-line bg-white px-3 text-body hover:border-gray-400 hover:text-ink"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={allHref} className="mt-6 inline-flex min-h-11 items-center link">
        {allLabel}
      </Link>
    </div>
  )
}

function TrustPoint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="inline-flex size-11 items-center justify-center rounded bg-brand-50 text-brand-700">{icon}</span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-body">{children}</p>
    </li>
  )
}
