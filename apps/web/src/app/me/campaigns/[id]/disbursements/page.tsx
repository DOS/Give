import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
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
  explanationOverdue,
  listDisbursements,
  listEvidence,
  listOutgoing,
  listRefundable,
  MAX_EVIDENCE_FILES,
  refundOptionLabel,
  statementHref,
  type Disbursement,
  type Evidence,
  type OutgoingTransaction,
  type RefundableContribution,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

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

  const outgoing = await listOutgoing(db, campaign.id)
  const ids = outgoing.map((tx) => tx.id)
  const [explanations, evidence, refundable] = await Promise.all([
    listDisbursements(db, ids),
    listEvidence(db, ids),
    listRefundable(db, campaign.id),
  ])
  const byTx = new Map(explanations.map((d) => [d.bank_transaction_id, d]))
  const pending = outgoing.filter((tx) => !byTx.has(tx.id))
  const done = outgoing.filter((tx) => byTx.has(tx.id))
  const refundCodes = new Map(refundable.map((x) => [x.id, x.reference_code]))

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <Link href={`/me/campaigns/${campaign.id}`} className="text-sm text-gray-600 hover:text-gray-900">
          ← {campaign.title}
        </Link>
        <h1 className="mt-3 text-3xl font-bold">Giải trình khoản chi</h1>
        <p className="mt-2 text-gray-600">
          Mỗi khoản tiền ra khỏi tài khoản nhận cần được giải trình trong {EXPLAIN_WITHIN_DAYS} ngày. Mục đích, loại
          khoản chi và người nhận sẽ hiện công khai trên sao kê; số khoản chưa giải trình cũng được công khai. Ảnh chứng
          từ chỉ bạn và bộ phận tài chính của Give xem được. Giải trình đã gửi thì không sửa được, nhưng có thể thêm
          chứng từ.
        </p>
        {isPublicStatus(campaign.status) && (
          <Link href={statementHref(campaign.slug, "all")} className="mt-2 inline-block text-sm text-brand-600">
            Xem sao kê công khai →
          </Link>
        )}
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Chưa giải trình ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-gray-500">Không có khoản chi nào đang chờ giải trình.</p>
        ) : (
          <ol className="space-y-6">
            {pending.map((tx) => (
              <li key={tx.id} className="card p-6">
                <TransactionHeader tx={tx} />
                {explanationOverdue(tx.booked_at) && (
                  <p className="mt-2 text-sm text-amber-700">Đã quá {EXPLAIN_WITHIN_DAYS} ngày, hãy giải trình ngay.</p>
                )}
                <ExplainForm campaignId={campaign.id} tx={tx} refundable={refundable} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Đã giải trình ({done.length})</h2>
        {done.length === 0 ? (
          <p className="text-gray-500">Chưa có khoản chi nào được giải trình.</p>
        ) : (
          <ol className="space-y-6">
            {done.map((tx) => (
              <li key={tx.id} className="card p-6">
                <TransactionHeader tx={tx} />
                <Explanation
                  disbursement={byTx.get(tx.id)!}
                  evidence={evidence.filter((e) => e.bank_transaction_id === tx.id)}
                  refundCode={refundCodes.get(byTx.get(tx.id)!.refund_contribution_id ?? "")}
                />
                <ActionForm
                  action={addEvidence.bind(null, campaign.id, tx.id)}
                  className="mt-4 border-t border-gray-100 pt-4"
                  resetOnSuccess
                >
                  <EvidenceFields idPrefix={`add-${tx.id}`} label="Thêm chứng từ" />
                  <SubmitButton className="mt-3 btn-secondary">Tải chứng từ lên</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function TransactionHeader({ tx }: { tx: OutgoingTransaction }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 text-sm">
        <p className="text-gray-500">{tx.booked_date_only ? formatDate(tx.booked_at) : formatDateTime(tx.booked_at)}</p>
        <p className="font-medium break-words">
          {tx.counterparty_name ?? "Không rõ người nhận"}
          {tx.counterparty_account_masked && (
            <span className="ml-2 font-normal text-gray-500">TK {tx.counterparty_account_masked}</span>
          )}
        </p>
        {tx.description && <p className="mt-1 break-words text-gray-600">Nội dung: {tx.description}</p>}
      </div>
      <p className="shrink-0 text-lg font-semibold tabular-nums">−{formatVnd(tx.amount)}</p>
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
      className="mt-4 space-y-4 border-t border-gray-100 pt-4"
      confirm="Giải trình sẽ được công khai và không sửa được. Gửi giải trình?"
    >
      <div>
        <label htmlFor={`${p}-purpose`} className="label">
          Mục đích
        </label>
        <textarea id={`${p}-purpose`} name="purpose" className="field" rows={2} required maxLength={1000} />
        <p className="hint">Ví dụ: Mua 200 bộ sách giáo khoa lớp 3 cho trường tiểu học A.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
            defaultValue={tx.counterparty_name ?? ""}
          />
          <p className="hint">Với khoản hoàn tiền cho người ủng hộ ẩn danh, tên này sẽ không hiện công khai.</p>
        </div>
      </div>
      <div>
        <label htmlFor={`${p}-refund`} className="label">
          Hoàn tiền cho lượt ủng hộ
        </label>
        <select id={`${p}-refund`} name="refund_contribution_id" className="field" defaultValue="">
          <option value="">Không phải hoàn tiền</option>
          {refundable.map((x) => (
            <option key={x.id} value={x.id}>
              {refundOptionLabel(x, formatVnd)}
            </option>
          ))}
        </select>
        <p className="hint">
          Chọn lượt ủng hộ nếu khoản này trả lại tiền cho người ủng hộ. Khoản đó được tính vào “đã hoàn lại” thay vì “đã
          chi”.
        </p>
      </div>
      <EvidenceFields idPrefix={p} label="Ảnh chứng từ (hóa đơn, biên nhận, ảnh trao tặng)" />
      <SubmitButton>Gửi giải trình</SubmitButton>
    </ActionForm>
  )
}

function EvidenceFields({ idPrefix, label }: { idPrefix: string; label: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-evidence`} className="label">
          {label}
        </label>
        <input
          id={`${idPrefix}-evidence`}
          name="evidence"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="field"
        />
        <p className="hint">
          Tối đa {MAX_EVIDENCE_FILES} ảnh JPEG, PNG hoặc WebP, tổng 4 MB mỗi lần. Thông tin vị trí và thiết bị trong ảnh
          được xóa trước khi lưu.
        </p>
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
  evidence,
  refundCode,
}: {
  disbursement: Disbursement
  evidence: Evidence[]
  refundCode: string | undefined
}) {
  const category = categoryLabel(disbursement.category)
  return (
    <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
      <p className="break-words">{disbursement.purpose}</p>
      <p className="flex flex-wrap gap-3 text-xs text-gray-500">
        {disbursement.is_refund && (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">
            Hoàn tiền{refundCode ? ` cho ${refundCode}` : ""}
          </span>
        )}
        {category && <span>{category}</span>}
        {disbursement.recipient && <span>Người nhận: {disbursement.recipient}</span>}
        <span>Giải trình lúc {formatDateTime(disbursement.explained_at)}</span>
      </p>
      {evidence.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {evidence.map((e) => (
            <li key={e.id}>
              <a
                href={evidenceUrl(e.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:text-brand-700"
              >
                {EVIDENCE_KINDS[e.kind] ?? e.kind} ({formatDate(e.created_at)})
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-amber-700">Chưa có ảnh chứng từ.</p>
      )}
    </div>
  )
}
