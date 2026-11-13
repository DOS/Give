import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { InboundExplanationList, ManualMatchList, UnattributedList } from "@/components/Reconciliation"
import { UnmatchedTransactionCard } from "@/components/UnmatchedTransaction"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { explainTransaction } from "@/app/admin/unmatched/actions"
import { matchTransaction } from "@/app/me/campaigns/[id]/unmatched/actions"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { campaignRefs, FINANCE_ROLES } from "@/lib/receiving-accounts"
import {
  campaignOrganizers,
  listInboundExplanations,
  listManualMatches,
  listMatchCandidates,
  listUnattributed,
  listUnmatched,
  ownerMismatchNotice,
  UNATTRIBUTED_CAUSES,
} from "@/lib/reconciliation"
import { accountLabels } from "@/lib/statement-import"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, ItemList } from "../_components/ui"

export const metadata: Metadata = { title: "Giao dịch chưa khớp", robots: { index: false } }

export default async function AdminUnmatchedPage() {
  const session = await requireSession("/admin/unmatched")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [{ transactions: unmatched, total }, unattributed, matches, explanations] = await Promise.all([
    listUnmatched(db),
    // A read error hides only this read-only section, not the queue above.
    listUnattributed(db).catch((e: { code?: string; message?: string } | null) => {
      console.error("unattributed bank_transactions failed", e?.code, e?.message)
      return null
    }),
    listManualMatches(db),
    listInboundExplanations(db),
  ])
  const campaignIds = [...new Set(unmatched.map((tx) => tx.campaign_id))]
  const [refs, candidateLists, organizers, accounts] = await Promise.all([
    campaignRefs(db, [
      ...campaignIds,
      ...matches.map((m) => m.tx.campaign_id),
      ...explanations.map((e) => e.tx.campaign_id),
    ]),
    Promise.all(campaignIds.map((id) => listMatchCandidates(db, id))),
    // Without organizers the match forms stay and the database still refuses.
    campaignOrganizers(db, campaignIds).catch((e: { code?: string; message?: string } | null) => {
      console.error("managed_campaigns organizers failed", e?.code, e?.message)
      return new Map<string, string>()
    }),
    // Without labels each row names "Tài khoản nhận" and keeps its transaction id.
    accountLabels(db, unattributed?.transactions.map((tx) => tx.receiving_account_id) ?? []).catch(
      (e: { code?: string; message?: string } | null) => {
        console.error("receiving account labels failed", e?.code, e?.message)
        return new Map<string, string>()
      }
    ),
  ])
  const candidates = new Map(campaignIds.map((id, i) => [id, candidateLists[i]]))
  const titles = new Map([...refs].map(([id, ref]) => [id, ref.title]))

  return (
    <AdminPage
      title="Giao dịch chưa khớp"
      intro={
        <>
          <p>
            Tiền đã vào tài khoản nhận của chiến dịch nhưng không có mã ủng hộ hợp lệ, nên đang được tính là &quot;chưa
            khớp&quot;. Khớp tay khi đã rõ khoản này của lượt ủng hộ nào; người tổ chức cũng khớp được ở trang chiến
            dịch của họ. Khớp tay chỉ chuyển tiền từ &quot;chưa khớp&quot; sang &quot;đã khớp&quot;, tổng đã thanh toán
            của chiến dịch không đổi. Mỗi giao dịch chỉ khớp được một lần, và mỗi lần được ghi vào nhật ký kiểm toán.
          </p>
          <p>
            Khoản không phải tiền ủng hộ (người tổ chức nạp thêm, ngân hàng hoàn phí, lãi) thì giải trình thay vì khớp,
            kể cả khi chiến dịch đã hủy hoặc đã đóng: ghi lý do và bằng chứng đã kiểm tra. Sao kê công khai chỉ hiện
            loại khoản tiền; tổng đã thanh toán không đổi, và giao dịch không còn chặn việc nhả tài khoản nhận.
          </p>
        </>
      }
    >
      <AdminSection
        id="unmatched"
        title="Chờ khớp"
        count={total > unmatched.length ? `${unmatched.length} mới nhất / ${total}` : total}
      >
        {unmatched.length === 0 ? (
          <EmptyState title="Không có giao dịch nào chờ khớp.">
            Tiền vào không có mã ủng hộ hợp lệ sẽ hiện ở đây để khớp tay hoặc giải trình.
          </EmptyState>
        ) : (
          <ItemList>
            {unmatched.map((tx) => (
              <UnmatchedTransactionCard
                key={tx.id}
                tx={tx}
                candidates={candidates.get(tx.campaign_id) ?? []}
                action={matchTransaction.bind(null, tx.id)}
                explainAction={explainTransaction.bind(null, tx.id)}
                campaignTitle={titles.get(tx.campaign_id) ?? tx.campaign_id}
                matchBlocked={ownerMismatchNotice(tx, organizers.get(tx.campaign_id), session.user.id)}
              />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection
        id="unattributed"
        title="Tiền vào không thuộc chiến dịch nào"
        count={
          !unattributed
            ? undefined
            : unattributed.total > unattributed.transactions.length
              ? `${unattributed.transactions.length} mới nhất / ${unattributed.total}`
              : unattributed.total
        }
        lead={`Tiền đã vào một tài khoản nhận nhưng không được tính cho chiến dịch nào. Lý do có thể là: ${UNATTRIBUTED_CAUSES}. Các khoản này không nằm trong tổng của chiến dịch nào và không khớp hay giải trình được ở đây. Khoản chuyển thử để xác minh tài khoản là bình thường; các khoản khác cần quản trị viên kiểm tra tài khoản nhận.`}
      >
        {!unattributed ? (
          <Callout tone="danger" title="Chưa tải được danh sách này.">
            Các phần khác của trang vẫn dùng được. Hãy tải lại trang sau.
          </Callout>
        ) : unattributed.transactions.length === 0 ? (
          <EmptyState title="Không có khoản tiền vào nào ngoài chiến dịch.">
            Tiền vào tài khoản nhận mà không thuộc chiến dịch nào sẽ hiện ở đây.
          </EmptyState>
        ) : (
          <UnattributedList transactions={unattributed.transactions} total={unattributed.total} accounts={accounts} />
        )}
      </AdminSection>

      <ManualMatchList matches={matches} titles={titles} />

      <InboundExplanationList explanations={explanations} titles={titles} />
    </AdminPage>
  )
}
