import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { requireSession } from "@/lib/auth/session"
import { getCampaignById, isPublicStatus } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import {
  categoryLabel,
  DISBURSEMENT_CATEGORIES,
  EVIDENCE_KINDS,
  EXPLAIN_WITHIN_DAYS,
  evidenceUrl,
  EXPLAINED_PAGE_LIMIT,
  explanationOverdue,
  listExplainedOutgoing,
  listPendingOutgoing,
  listReferenceCodes,
  listRefundable,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_PER_TRANSACTION,
  refundOptionLabel,
  statementHref,
  type Disbursement,
  type OutgoingTransaction,
  type RefundableContribution,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"
import { listHiddenEvidence, type EvidenceState } from "@/lib/evidence-moderation"

import { MeDetail } from "../../../_components/MePage"
import { fileInputClass } from "../../../_components/Panel"

import { addEvidence, explainDisbursement } from "./actions"

export const metadata: Metadata = { title: "Giải trình khoản chi", robots: { index: false } }

/**
 * The organizer's list of outgoing transactions from the campaign's receiving
 * account, each with its explanation or a form to give one. Everything is
 * read under RLS with the organizer's token.
 */
export default async function DisbursementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(`/me/campaigns/${id}/disbursements`)
  if (!isUuid(id)) notFound()
  const db = dbAs(session.accessToken)
  const campaign = await getCampaignById(db, id)
  if (!campaign || campaign.organizer_id !== session.user.id) notFound()

  const [pending, done, refundable] = await Promise.all([
    listPendingOutgoing(db, campaign.id),
    listExplainedOutgoing(db, campaign.id),
    listRefundable(db, campaign.id),
  ])
  const [refundCodes, hiddenEvidence] = await Promise.all([
    listReferenceCodes(
      db,
      campaign.id,
      done.flatMap((tx) => (tx.disbursement.refund_contribution_id ? [tx.disbursement.refund_contribution_id] : []))
    ),
    listHiddenEvidence(db),
  ])

  return (
    <MeDetail>
      <PageHeader back={{ href: `/me/campaigns/${campaign.id}`, label: campaign.title }} title="Giải trình khoản chi">
        <p>
          Mỗi khoản tiền ra khỏi tài khoản nhận cần được giải trình trong {EXPLAIN_WITHIN_DAYS} ngày. Mục đích, loại
          khoản chi, người nhận và ảnh chứng từ sẽ hiện công khai trên sao kê; số khoản chưa giải trình cũng được công
          khai. Giải trình đã gửi thì không sửa được, nhưng có thể thêm chứng từ.
        </p>
        {isPublicStatus(campaign.status) && (
          <Link href={statementHref(campaign.slug, "all")} className="mt-1 inline-flex min-h-11 items-center link">
            Xem sao kê công khai →
          </Link>
        )}
      </PageHeader>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
          Chưa giải trình
          <Badge tone={pending.length > 0 ? "warning" : "neutral"}>{pending.length}</Badge>
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="Không có khoản chi nào đang chờ giải trình." />
        ) : (
          <ol className="space-y-6">
            {pending.map((tx) => (
              <li key={tx.id} className="card p-5 sm:p-6">
                <TransactionHeader tx={tx} />
                {explanationOverdue(tx.booked_at) && (
                  <Callout tone="warning" className="mt-4">
                    Đã quá {EXPLAIN_WITHIN_DAYS} ngày, hãy giải trình ngay.
                  </Callout>
                )}
                <ExplainForm campaignId={campaign.id} tx={tx} refundable={refundable} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="done-heading">
        <h2 id="done-heading" className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
          Đã giải trình
          {done.length < EXPLAINED_PAGE_LIMIT && <Badge>{done.length}</Badge>}
        </h2>
        {done.length >= EXPLAINED_PAGE_LIMIT && (
          <p className="mb-4 text-muted">
            Hiện {EXPLAINED_PAGE_LIMIT} khoản gần nhất. Xem toàn bộ trên sao kê công khai.
          </p>
        )}
        {done.length === 0 ? (
          <EmptyState title="Chưa có khoản chi nào được giải trình." />
        ) : (
          <ol className="space-y-6">
            {done.map((tx) => (
              <li key={tx.id} className="card p-5 sm:p-6">
                <TransactionHeader tx={tx} />
                <Explanation
                  disbursement={tx.disbursement}
                  refundCode={refundCodes.get(tx.disbursement.refund_contribution_id ?? "")}
                  hidden={hiddenEvidence}
                />
                {/* Hidden images do not count, so a redacted copy can always be uploaded. */}
                {tx.disbursement.evidence.filter((e) => !hiddenEvidence.has(e.id)).length <
                  MAX_EVIDENCE_PER_TRANSACTION && (
                  <ActionForm
                    action={addEvidence.bind(null, campaign.id, tx.id)}
                    className="mt-5 border-t border-line pt-5"
                    resetOnSuccess
                  >
                    <EvidenceFields
                      idPrefix={`add-${tx.id}`}
                      label="Thêm chứng từ"
                      refund={tx.disbursement.is_refund}
                    />
                    <SubmitButton className={buttonClass({ variant: "secondary", className: "mt-4" })}>
                      Tải chứng từ lên
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </MeDetail>
  )
}

function TransactionHeader({ tx }: { tx: OutgoingTransaction }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm text-muted">
          {tx.booked_date_only ? formatDate(tx.booked_at) : formatDateTime(tx.booked_at)}
        </p>
        <p className="mt-0.5 font-semibold break-words text-ink">
          {tx.counterparty_name ?? "Không rõ người nhận"}
          {tx.counterparty_account_masked && (
            <span className="ml-2 font-normal text-muted">TK {tx.counterparty_account_masked}</span>
          )}
        </p>
        {tx.description && <p className="mt-1 break-words text-body">Nội dung: {tx.description}</p>}
      </div>
      <p className="shrink-0 text-xl font-bold text-ink tabular-nums">−{formatVnd(tx.amount)}</p>
    </div>
  )
}

function ExplainForm({
  campaignId,
  tx,
  refundable,
}: {
  campaignId: string
  tx: OutgoingTransaction
  refundable: RefundableContribution[]
}) {
  const p = `tx-${tx.id}`
  return (
    <ActionForm
      action={explainDisbursement.bind(null, campaignId, tx.id)}
      className="mt-5 space-y-5 border-t border-line pt-5"
      confirm="Giải trình sẽ được công khai và không sửa được. Gửi giải trình?"
    >
      <div>
        <label htmlFor={`${p}-purpose`} className="label">
          Mục đích
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
          Ví dụ: Mua 200 bộ sách giáo khoa lớp 3 cho trường tiểu học A.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-category`} className="label">
            Loại khoản chi
          </label>
          <select id={`${p}-category`} name="category" className="field" required defaultValue="">
            <option value="" disabled>
              Chọn loại
            </option>
            {Object.entries(DISBURSEMENT_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
            Tên này hiện công khai. Với cá nhân (người bệnh, trẻ em), cân nhắc chỉ ghi vai trò, ví dụ “gia đình em A”.
            Khoản hoàn tiền cho người ủng hộ ẩn danh không hiện tên này.
          </p>
        </div>
      </div>
      <div>
        <label htmlFor={`${p}-refund`} className="label">
          Hoàn tiền cho lượt ủng hộ
        </label>
        <select
          id={`${p}-refund`}
          name="refund_contribution_id"
          className="field"
          defaultValue=""
          aria-describedby={`${p}-refund-hint`}
        >
          <option value="">Không phải hoàn tiền</option>
          {refundable.map((x) => (
            <option key={x.id} value={x.id}>
              {refundOptionLabel(x, formatVnd)}
            </option>
          ))}
        </select>
        <p id={`${p}-refund-hint`} className="hint">
          Chỉ chọn khi loại khoản chi là “Hoàn tiền cho người ủng hộ”. Khoản đó được tính vào “đã hoàn lại” thay vì “đã
          chi”.
        </p>
      </div>
      <EvidenceFields idPrefix={p} label="Ảnh chứng từ (hóa đơn, biên nhận, ảnh trao tặng)" />
      <SubmitButton className={buttonClass()}>Gửi giải trình</SubmitButton>
    </ActionForm>
  )
}

/**
 * `refund`: true for evidence of a refund, which stays private (it would name
 * the donor); undefined in the explain form, where the category is not chosen yet.
 */
function EvidenceFields({ idPrefix, label, refund }: { idPrefix: string; label: string; refund?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <div className="space-y-2 sm:col-span-2">
        <div>
          <label htmlFor={`${idPrefix}-evidence`} className="label">
            {label}
          </label>
          <input
            id={`${idPrefix}-evidence`}
            name="evidence"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-describedby={`${idPrefix}-evidence-hint`}
            className={fileInputClass}
          />
          <p id={`${idPrefix}-evidence-hint`} className="hint">
            Tối đa {MAX_EVIDENCE_FILES} ảnh JPEG, PNG hoặc WebP, tổng 4 MB mỗi lần. Thông tin vị trí và thiết bị trong
            ảnh được xóa trước khi lưu.
          </p>
        </div>
        {refund ? (
          <Callout>
            Chứng từ của khoản hoàn tiền không được công khai: chỉ bạn và bộ phận tài chính của Give xem được.
          </Callout>
        ) : (
          <Callout tone="warning">
            Ảnh chứng từ được công khai cho mọi người xem. Trước khi tải lên, hãy che kín thông tin cá nhân của người
            nhận: số CCCD, số điện thoại, địa chỉ, số tài khoản. Ai cũng có thể báo cáo ảnh lộ thông tin cá nhân, và
            Give sẽ ẩn ảnh đó.
            {refund === undefined && " Riêng chứng từ của khoản hoàn tiền cho người ủng hộ thì không được công khai."}
          </Callout>
        )}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-kind`} className="label">
          Loại chứng từ
        </label>
        <select id={`${idPrefix}-kind`} name="evidence_kind" className="field" defaultValue="receipt">
          {Object.entries(EVIDENCE_KINDS).map(([value, kindLabel]) => (
            <option key={value} value={value}>
              {kindLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function Explanation({
  disbursement,
  refundCode,
  hidden,
}: {
  disbursement: Disbursement
  refundCode: string | undefined
  /** Evidence staff hid from the public statement, by evidence id. */
  hidden: Map<string, EvidenceState>
}) {
  const category = categoryLabel(disbursement.category)
  const evidence = disbursement.evidence
  return (
    <div className="mt-5 space-y-3 border-t border-line pt-5">
      <p className="break-words text-ink">{disbursement.purpose}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {disbursement.is_refund && <Badge tone="info">Hoàn tiền{refundCode ? ` cho ${refundCode}` : ""}</Badge>}
        {category && <span>{category}</span>}
        {disbursement.recipient && <span className="break-words">Người nhận: {disbursement.recipient}</span>}
        <span>Giải trình lúc {formatDateTime(disbursement.explained_at)}</span>
      </p>
      {evidence.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {evidence.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2">
              <a
                href={evidenceUrl(e.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center link"
              >
                {EVIDENCE_KINDS[e.kind] ?? e.kind} ({formatDate(e.created_at)})
              </a>
              {hidden.has(e.id) && (
                <span className="rounded bg-red-50 px-2 py-0.5 text-sm break-words text-red-800">
                  Give đã ẩn khỏi sao kê
                  {hidden.get(e.id)?.reason ? `: ${hidden.get(e.id)?.reason}` : ""}. Hãy tải lên bản đã che thông tin cá
                  nhân.
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-medium text-amber-800">Chưa có ảnh chứng từ.</p>
      )}
    </div>
  )
}
