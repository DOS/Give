import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { StatusBadge } from "@/components/badges"
import { ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { listCampaignsWithUnexplainedOutgoing, UNEXPLAINED_SCAN_LIMIT } from "@/lib/staff-refunds"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemCard, ItemList } from "../_components/ui"
import { RefundsIntro } from "./RefundsIntro"

export const metadata: Metadata = { title: "Ghi khoản hoàn tiền", robots: { index: false } }

/**
 * Finance's list of campaigns with transfers out still to explain
 * (DOS/Give#203). Each opens the campaign's transfers out, where staff record
 * one as a refund to a contribution the organizer cannot refund themselves.
 */
export default async function AdminRefundsPage() {
  const session = await requireSession("/admin/refunds")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const { campaigns, truncated } = await listCampaignsWithUnexplainedOutgoing(db)

  return (
    <AdminPage title="Ghi khoản hoàn tiền" intro={<RefundsIntro />}>
      <AdminSection id="campaigns" title="Chiến dịch có khoản tiền ra chưa giải trình" count={campaigns.length}>
        {truncated && (
          <Callout tone="warning">
            Danh sách chỉ tính {UNEXPLAINED_SCAN_LIMIT} khoản tiền ra chờ lâu nhất. Chiến dịch có khoản mới hơn có thể
            chưa hiện ở đây.
          </Callout>
        )}
        {campaigns.length === 0 ? (
          <EmptyState title="Không có khoản tiền ra nào chờ giải trình.">
            Chiến dịch có khoản tiền ra chưa giải trình sẽ hiện ở đây, chờ lâu nhất ở trên cùng.
          </EmptyState>
        ) : (
          <ItemList>
            {campaigns.map((c) => (
              <ItemCard key={c.campaign_id}>
                <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-h3 break-words">
                  {c.title ?? c.campaign_id}
                  {c.status && <StatusBadge status={c.status} />}
                </h3>
                <Facts>
                  <Fact label="Chưa giải trình">
                    <span className="tabular-nums">{c.count} khoản</span>
                  </Fact>
                  <Fact label="Tổng tiền ra">
                    <span className="font-semibold tabular-nums">{formatVnd(c.amount)}</span>
                  </Fact>
                  <Fact label="Khoản cũ nhất">{formatDate(c.oldest_booked_at)}</Fact>
                </Facts>
                <div className="border-t border-border pt-6">
                  <ButtonLink href={`/admin/refunds/${c.campaign_id}`} variant="secondary">
                    Xem các khoản tiền ra
                  </ButtonLink>
                </div>
              </ItemCard>
            ))}
          </ItemList>
        )}
      </AdminSection>
    </AdminPage>
  )
}
