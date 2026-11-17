import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StatusBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { requireSession } from "@/lib/auth/session"
import { getCampaignById, isPublicStatus, isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { OWN_CONTRIBUTION_SCOPE } from "@/lib/own-contribution"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import {
  EVIDENCE_KINDS,
  explanationOverdue,
  EXPLAIN_WITHIN_DAYS,
  listRefundable,
  listUnexplainedOutgoing,
  MAX_EVIDENCE_FILES,
  refundOptionLabel,
  statementHref,
  type OutgoingTransaction,
  type RefundableContribution,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import { fileInputClass } from "../../../me/_components/Panel"
import { AdminPage, AdminSection, ItemCard, ItemList } from "../../_components/ui"
import { RefundsIntro } from "../RefundsIntro"
import { recordStaffRefund } from "./actions"

export const metadata: Metadata = { title: "Ghi khoản hoàn tiền", robots: { index: false } }

/**
 * One campaign's transfers out still to explain, for finance (DOS/Give#203):
 * each can be recorded as a refund to a contribution of the campaign. The
 * same list as the organizer's (listUnexplainedOutgoing): transfers paired as
 * a move to the campaign's new account are left out, and transfers the bank
 * returned are shown apart and never offered. The picker leaves out the staff
 * member's own contributions and those that cannot take the whole transfer.
 */
export default async function AdminCampaignRefundsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(`/admin/refunds/${id}`)
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()
  if (!isUuid(id)) notFound()
  const campaign = await getCampaignById(db, id)
  if (!campaign) notFound()

  const [{ pending, returned }, refundable] = await Promise.all([
    listUnexplainedOutgoing(db, campaign.id),
    listRefundable(db, campaign.id, session.user),
  ])

  return (
    <div className="space-y-6">
      <Link href="/admin/refunds" className="inline-flex min-h-11 items-center link">
        ← Các chiến dịch có khoản tiền ra chưa giải trình
      </Link>
      <AdminPage
        title={campaign.title}
        action={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge status={campaign.status} />
            {isPublicStatus(campaign.status) && (
              <Link href={statementHref(campaign.slug, "all")} className="inline-flex min-h-11 items-center link">
                Xem sao kê công khai →
              </Link>
            )}
          </div>
        }
        intro={<RefundsIntro />}
      >
        <AdminSection id="pending" title="Khoản tiền ra chưa giải trình" count={pending.length}>
          {pending.length === 0 ? (
            <EmptyState title="Chiến dịch này không có khoản tiền ra nào chờ giải trình." />
          ) : (
            <ItemList>
              {pending.map((tx) => (
                <ItemCard key={tx.id}>
                  <TransactionHeader tx={tx} />
                  {explanationOverdue(tx.booked_at) && (
                    <Callout tone="warning">Đã quá {EXPLAIN_WITHIN_DAYS} ngày mà chưa giải trình.</Callout>
                  )}
                  <RefundForm
                    campaignId={campaign.id}
                    tx={tx}
                    options={refundable.filter((x) => x.refundable_amount >= tx.amount)}
                  />
                </ItemCard>
              ))}
            </ItemList>
          )}
        </AdminSection>

        {returned.length > 0 && (
          <AdminSection
            id="returned"
            title="Bị ngân hàng trả lại"
            count={returned.length}
            lead="Tiền đã quay về tài khoản của chiến dịch, nên không ghi được là hoàn tiền."
          >
            <ItemList>
              {returned.map((tx) => (
                <ItemCard key={tx.id}>
                  <TransactionHeader tx={tx} />
                </ItemCard>
              ))}
            </ItemList>
          </AdminSection>
        )}
      </AdminPage>
    </div>
  )
}

function TransactionHeader({ tx }: { tx: OutgoingTransaction }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm text-muted">
          {tx.booked_date_only ? formatDate(tx.booked_at) : formatDateTime(tx.booked_at)}
        </p>
        <p className="mt-1 font-semibold break-words text-fg">
          {tx.counterparty_name ?? "Không rõ người nhận"}
          {tx.counterparty_account_masked && (
            <span className="ml-2 font-normal text-muted tabular-nums">TK {tx.counterparty_account_masked}</span>
          )}
        </p>
        {tx.description && <p className="mt-1 break-words text-fg">Nội dung: {tx.description}</p>}
      </div>
      <p className="shrink-0 text-h3 font-bold text-fg tabular-nums">−{formatVnd(tx.amount)}</p>
    </div>
  )
}

function RefundForm({
  campaignId,
  tx,
  options,
}: {
  campaignId: string
  tx: OutgoingTransaction
  /** Contributions that can take the whole transfer, the staff member's own left out. */
  options: RefundableContribution[]
}) {
  const p = `tx-${tx.id}`
  if (options.length === 0) {
    return (
      <Callout tone="info">
        Không có lượt ủng hộ nào của chiến dịch còn hoàn được từ {formatVnd(tx.amount)} trở lên (lượt ủng hộ của chính
        bạn không tính). Nếu đây không phải hoàn tiền, người tổ chức giải trình như một khoản chi.
      </Callout>
    )
  }
  return (
    <ActionForm
      action={recordStaffRefund.bind(null, campaignId, tx.id)}
      className="space-y-6 border-t border-border pt-6 [&>*]:max-w-160"
      confirm={`Ghi khoản −${formatVnd(tx.amount)} là hoàn tiền cho lượt ủng hộ đã chọn? Giải trình sẽ công khai trên sao kê và không sửa được.`}
    >
      <div>
        <label htmlFor={`${p}-refund`} className="label">
          Hoàn tiền cho lượt ủng hộ
        </label>
        <select
          id={`${p}-refund`}
          name="refund_contribution_id"
          className="field"
          required
          defaultValue=""
          aria-describedby={`${p}-refund-hint`}
        >
          <option value="" disabled>
            Chọn lượt ủng hộ
          </option>
          {options.map((x) => (
            <option key={x.id} value={x.id}>
              {refundOptionLabel(x, formatVnd)}
            </option>
          ))}
        </select>
        <p id={`${p}-refund-hint`} className="hint">
          Đối chiếu mã ủng hộ với người tổ chức và chứng từ chuyển khoản. Chỉ hiện lượt còn hoàn được từ{" "}
          {formatVnd(tx.amount)} trở lên. Lượt ủng hộ của chính bạn ({OWN_CONTRIBUTION_SCOPE}) không có trong danh sách.
        </p>
      </div>
      <div>
        <label htmlFor={`${p}-purpose`} className="label">
          Mục đích (công khai)
        </label>
        <textarea
          id={`${p}-purpose`}
          name="purpose"
          className="field"
          rows={2}
          required
          maxLength={1000}
          aria-describedby={`${p}-purpose-hint`}
        />
        <p id={`${p}-purpose-hint`} className="hint">
          Ví dụ: Hoàn lại khoản ủng hộ theo yêu cầu của người ủng hộ.
        </p>
      </div>
      <div>
        <label htmlFor={`${p}-recipient`} className="label">
          Người nhận (công khai)
        </label>
        <input
          id={`${p}-recipient`}
          name="recipient"
          className="field"
          maxLength={200}
          aria-describedby={`${p}-recipient-hint`}
        />
        <p id={`${p}-recipient-hint`} className="hint">
          Không bắt buộc. Khoản hoàn tiền cho người ủng hộ ẩn danh không hiện tên này.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-2 sm:col-span-2">
          <div>
            <label htmlFor={`${p}-evidence`} className="label">
              Ảnh chứng từ chuyển khoản
            </label>
            <input
              id={`${p}-evidence`}
              name="evidence"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              aria-describedby={`${p}-evidence-hint`}
              className={fileInputClass}
            />
            <p id={`${p}-evidence-hint`} className="hint">
              Tối đa {MAX_EVIDENCE_FILES} ảnh JPEG, PNG hoặc WebP, tổng 4 MB mỗi lần. Thông tin vị trí và thiết bị trong
              ảnh được xóa trước khi lưu.
            </p>
          </div>
          <Callout>
            Chứng từ của khoản hoàn tiền không được công khai: chỉ người tổ chức chiến dịch, bộ phận tài chính và quản
            trị viên của Give xem được.
          </Callout>
        </div>
        <div>
          <label htmlFor={`${p}-kind`} className="label">
            Loại chứng từ
          </label>
          <select id={`${p}-kind`} name="evidence_kind" className="field" defaultValue="receipt">
            {Object.entries(EVIDENCE_KINDS).map(([value, kindLabel]) => (
              <option key={value} value={value}>
                {kindLabel}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SubmitButton>Ghi là hoàn tiền</SubmitButton>
    </ActionForm>
  )
}
