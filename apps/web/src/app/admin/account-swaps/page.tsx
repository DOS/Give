import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccountStatusBadge, StatusBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import {
  approvalBlock,
  listDecidedSwaps,
  listSwapsToReview,
  SWAP_PUBLIC_NOTE_MAX,
  SWAP_REASON_MAX,
  SWAP_STATUS_LABELS,
  transactionCounts,
  type SwapForReview,
} from "@/lib/account-swaps"
import { requireSession } from "@/lib/auth/session"
import { bankLabel } from "@/lib/banks"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime } from "@/lib/format"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { decideAccountSwap } from "./actions"

export const metadata: Metadata = { title: "Đổi tài khoản nhận", robots: { index: false } }

/**
 * Finance queue of account swaps (DOS/Give#55): organizers of give campaigns
 * that may hold money ask to replace an account that stopped being usable;
 * finance or an admin approves (the old binding ends and the new one starts
 * at the same instant) or rejects.
 */
export default async function AdminAccountSwapsPage() {
  const session = await requireSession("/admin/account-swaps")
  const db = dbAs(session.accessToken)
  // Only finance and admin staff read swap requests (RLS); others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [pending, decided] = await Promise.all([listSwapsToReview(db), listDecidedSwaps(db)])
  const counts = await transactionCounts(
    db,
    pending.map((s) => s.old_binding_id)
  )

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin/accounts" className="text-sm text-gray-600 hover:text-gray-900">
          ← Xác minh tài khoản nhận
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Đổi tài khoản nhận</h1>
        <p className="mt-2 text-sm text-gray-600">
          Người tổ chức của chiến dịch từ thiện đang gây quỹ, đang tạm dừng, hoặc cần chỉnh sửa mà tài khoản đã nhận
          giao dịch, đề nghị thay tài khoản nhận không còn dùng được bằng một tài khoản khác đã xác minh, đứng tên họ.
          Chỉ duyệt khi có căn cứ rằng tài khoản cũ không dùng được nữa (thư hoặc thông báo của ngân hàng, kết quả kiểm
          tra gian lận). Khi duyệt, tài khoản cũ ngừng nhận cho chiến dịch và bị khóa, tài khoản mới bắt đầu nhận ngay;
          tiền đã vào tài khoản cũ trước lúc đó vẫn thuộc chiến dịch. Trang chiến dịch và sao kê công khai ngày đổi. Mọi
          thao tác được ghi vào nhật ký kiểm toán.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">Chờ duyệt ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có yêu cầu nào chờ duyệt.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((swap) => (
              <SwapCard
                key={swap.id}
                swap={swap}
                oldTransactions={counts.get(swap.old_binding_id) ?? 0}
                selfId={session.user.id}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Đã xử lý gần đây ({decided.length})</h2>
        {decided.length === 0 ? (
          <p className="card p-6 text-gray-600">Chưa có yêu cầu nào được xử lý.</p>
        ) : (
          <ul className="space-y-4">
            {decided.map((swap) => (
              <SwapCard key={swap.id} swap={swap} oldTransactions={null} selfId={session.user.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AccountLine({ account }: { account: SwapForReview["new_account"] }) {
  if (!account) return <dd>—</dd>
  return (
    <dd className="flex flex-wrap items-center gap-2">
      <span>
        {bankLabel(account.bank_bin)} · <span className="font-mono">{account.account_number}</span> ·{" "}
        {account.account_name}
      </span>
      <AccountStatusBadge status={account.verification_status} />
    </dd>
  )
}

function SwapCard({
  swap,
  oldTransactions,
  selfId,
}: {
  swap: SwapForReview
  /** Transactions the old binding recorded, for a pending request; null for a decided one. */
  oldTransactions: number | null
  selfId: string
}) {
  const campaign = swap.campaign
  const own = campaign?.organizer_id === selfId
  const block = oldTransactions === null ? null : approvalBlock(swap, oldTransactions)

  return (
    <li className="space-y-4 card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid min-w-0 flex-1 gap-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Chiến dịch</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {campaign ? (
                <>
                  <span className="font-semibold">{campaign.title}</span>
                  <StatusBadge status={campaign.status} />
                </>
              ) : (
                swap.campaign_id
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Người tổ chức</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {campaign?.organizer ? (
                <>
                  {campaign.organizer.display_name} (tên pháp lý: {campaign.organizer.legal_name})
                  <VerificationBadge status={campaign.organizer.verification_status} />
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Tài khoản cũ</dt>
            <AccountLine account={swap.old_binding?.account ?? null} />
            {swap.old_binding && (
              <p className="mt-1 text-gray-600">
                Gắn từ {formatDate(swap.old_binding.bound_at)}
                {swap.old_binding.released_at ? `, ngừng lúc ${formatDateTime(swap.old_binding.released_at)}` : ""}
                {oldTransactions !== null && ` · ${oldTransactions} giao dịch đã ghi nhận`}
              </p>
            )}
            {swap.old_binding?.account?.review_note && (
              <p className="mt-1 text-gray-600">Ghi chú tài chính: {swap.old_binding.account.review_note}</p>
            )}
          </div>
          <div>
            <dt className="text-gray-500">Tài khoản mới</dt>
            <AccountLine account={swap.new_account} />
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Lý do người tổ chức đưa ra (gửi {formatDateTime(swap.created_at)})</dt>
            <dd className="break-words whitespace-pre-line">{swap.reason}</dd>
          </div>
          {swap.status !== "pending" && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">
                {SWAP_STATUS_LABELS[swap.status]} lúc {formatDateTime(swap.decided_at)}
              </dt>
              <dd className="break-words">
                {swap.decision_note ?? "—"}
                {swap.public_note && <span className="block text-gray-600">Công khai: {swap.public_note}</span>}
              </dd>
            </div>
          )}
        </dl>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {SWAP_STATUS_LABELS[swap.status]}
        </span>
      </div>

      {swap.status === "pending" &&
        (own ? (
          <p className="text-sm text-amber-800">Đây là chiến dịch của bạn; một nhân viên khác cần xử lý.</p>
        ) : (
          <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            {block ? (
              <p className="text-sm text-amber-800">Chưa duyệt được: {block}</p>
            ) : (
              <ActionForm
                action={decideAccountSwap.bind(null, swap.id)}
                confirm="Duyệt đổi tài khoản? Tài khoản cũ ngừng nhận cho chiến dịch và bị khóa ngay; tài khoản mới bắt đầu nhận. Không hoàn tác được."
                className="space-y-2"
              >
                <input type="hidden" name="decision" value="approved" />
                <label htmlFor={`approve-note-${swap.id}`} className="label">
                  Căn cứ duyệt (người tổ chức thấy; là lý do khóa tài khoản cũ)
                </label>
                <textarea
                  id={`approve-note-${swap.id}`}
                  name="note"
                  className="field"
                  rows={2}
                  required
                  maxLength={SWAP_REASON_MAX}
                />
                <label htmlFor={`public-note-${swap.id}`} className="label">
                  Ghi chú công khai (không bắt buộc)
                </label>
                <input
                  id={`public-note-${swap.id}`}
                  name="public_note"
                  className="field"
                  maxLength={SWAP_PUBLIC_NOTE_MAX}
                  placeholder="Ví dụ: Ngân hàng đã đóng tài khoản cũ."
                />
                <SubmitButton>Duyệt đổi tài khoản</SubmitButton>
              </ActionForm>
            )}
            <ActionForm
              action={decideAccountSwap.bind(null, swap.id)}
              confirm="Từ chối yêu cầu đổi tài khoản này?"
              className="space-y-2"
            >
              <input type="hidden" name="decision" value="rejected" />
              <label htmlFor={`reject-note-${swap.id}`} className="label">
                Từ chối
              </label>
              <textarea
                id={`reject-note-${swap.id}`}
                name="note"
                className="field"
                rows={2}
                required
                maxLength={SWAP_REASON_MAX}
                placeholder="Lý do (người tổ chức sẽ thấy)"
              />
              <SubmitButton className="btn-danger">Từ chối</SubmitButton>
            </ActionForm>
          </div>
        ))}
    </li>
  )
}
