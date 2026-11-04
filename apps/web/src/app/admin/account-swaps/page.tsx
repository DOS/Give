import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AccountStatusBadge, StatusBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
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

import { AdminPage, AdminSection, Fact, Facts, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { decideAccountSwap } from "./actions"

export const metadata: Metadata = { title: "Đổi tài khoản nhận", robots: { index: false } }

const SWAP_TONES: Record<SwapForReview["status"], BadgeTone> = {
  pending: "warning",
  approved: "brand",
  rejected: "danger",
  cancelled: "neutral",
}

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
    <AdminPage
      title="Đổi tài khoản nhận"
      intro={
        <p>
          Người tổ chức của chiến dịch từ thiện đang gây quỹ, đang tạm dừng, hoặc cần chỉnh sửa mà tài khoản đã nhận
          giao dịch, đề nghị thay tài khoản nhận không còn dùng được bằng một tài khoản khác đã xác minh, đứng tên họ.
          Chỉ duyệt khi có căn cứ rằng tài khoản cũ không dùng được nữa (thư hoặc thông báo của ngân hàng, kết quả kiểm
          tra gian lận). Khi duyệt, tài khoản cũ ngừng nhận cho chiến dịch và bị khóa, tài khoản mới bắt đầu nhận ngay;
          tiền đã vào tài khoản cũ trước lúc đó vẫn thuộc chiến dịch. Trang chiến dịch và sao kê công khai ngày đổi. Mọi
          thao tác được ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      <AdminSection id="pending" title="Chờ duyệt" count={pending.length}>
        {pending.length === 0 ? (
          <EmptyState title="Không có yêu cầu nào chờ duyệt.">
            Yêu cầu đổi tài khoản của người tổ chức sẽ hiện ở đây.
          </EmptyState>
        ) : (
          <ItemList>
            {pending.map((swap) => (
              <SwapCard
                key={swap.id}
                swap={swap}
                oldTransactions={counts.get(swap.old_binding_id) ?? 0}
                selfId={session.user.id}
              />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection id="decided" title="Đã xử lý gần đây" count={decided.length}>
        {decided.length === 0 ? (
          <EmptyState title="Chưa có yêu cầu nào được xử lý." />
        ) : (
          <ItemList>
            {decided.map((swap) => (
              <SwapCard key={swap.id} swap={swap} oldTransactions={null} selfId={session.user.id} />
            ))}
          </ItemList>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function AccountLine({ account }: { account: NonNullable<SwapForReview["old_binding"]>["account"] }) {
  if (!account) return <dd className="mt-0.5 text-ink">—</dd>
  return (
    <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-ink">
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
  const organizer = swap.new_account?.organizer ?? null
  const own = swap.new_account?.owner_user_id === selfId
  const block = oldTransactions === null ? null : approvalBlock(swap, oldTransactions)

  return (
    <ItemCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-lg font-semibold">
          {campaign ? (
            <>
              {campaign.title}
              <StatusBadge status={campaign.status} />
            </>
          ) : (
            swap.campaign_id
          )}
        </h3>
        <Badge tone={SWAP_TONES[swap.status]}>{SWAP_STATUS_LABELS[swap.status]}</Badge>
      </div>
      <Facts columns={2}>
        <Fact label="Người tổ chức" wide>
          {organizer ? (
            <span className="flex flex-wrap items-center gap-2">
              {organizer.display_name} (tên pháp lý: {organizer.legal_name})
              <VerificationBadge status={organizer.verification_status} />
            </span>
          ) : (
            "—"
          )}
        </Fact>
        <div className="min-w-0">
          <dt className="text-sm text-muted">Tài khoản cũ</dt>
          <AccountLine account={swap.old_binding?.account ?? null} />
          {swap.old_binding && (
            <dd className="mt-1 text-sm text-muted">
              Gắn từ {formatDate(swap.old_binding.bound_at)}
              {swap.old_binding.released_at ? `, ngừng lúc ${formatDateTime(swap.old_binding.released_at)}` : ""}
              {oldTransactions !== null && ` · ${oldTransactions} giao dịch đã ghi nhận`}
            </dd>
          )}
          {swap.old_binding?.account?.review_note && (
            <dd className="mt-1 text-sm text-muted">Ghi chú tài chính: {swap.old_binding.account.review_note}</dd>
          )}
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted">Tài khoản mới</dt>
          <AccountLine account={swap.new_account} />
        </div>
        <Fact label={`Lý do người tổ chức đưa ra (gửi ${formatDateTime(swap.created_at)})`} wide>
          <span className="whitespace-pre-line">{swap.reason}</span>
        </Fact>
        {swap.status !== "pending" && (
          <Fact label={`${SWAP_STATUS_LABELS[swap.status]} lúc ${formatDateTime(swap.decided_at)}`} wide>
            {swap.decision_note ?? "—"}
            {swap.public_note && <span className="block text-muted">Công khai: {swap.public_note}</span>}
          </Fact>
        )}
      </Facts>

      {swap.status === "pending" &&
        (own ? (
          <Callout tone="warning">Đây là chiến dịch của bạn; một nhân viên khác cần xử lý.</Callout>
        ) : (
          <ItemActions>
            {block ? (
              <Callout tone="warning">Chưa duyệt được: {block}</Callout>
            ) : (
              <ActionForm
                action={decideAccountSwap.bind(null, swap.id)}
                confirm="Duyệt đổi tài khoản? Tài khoản cũ ngừng nhận cho chiến dịch và bị khóa ngay; tài khoản mới bắt đầu nhận. Không hoàn tác được."
                className="space-y-3"
              >
                <input type="hidden" name="decision" value="approved" />
                <Field
                  htmlFor={`approve-note-${swap.id}`}
                  label="Căn cứ duyệt (người tổ chức thấy; là lý do khóa tài khoản cũ)"
                >
                  <textarea
                    id={`approve-note-${swap.id}`}
                    name="note"
                    className="field"
                    rows={2}
                    required
                    maxLength={SWAP_REASON_MAX}
                  />
                </Field>
                <Field htmlFor={`public-note-${swap.id}`} label="Ghi chú công khai (không bắt buộc)">
                  <input
                    id={`public-note-${swap.id}`}
                    name="public_note"
                    className="field"
                    maxLength={SWAP_PUBLIC_NOTE_MAX}
                    placeholder="Ví dụ: Ngân hàng đã đóng tài khoản cũ."
                  />
                </Field>
                <SubmitButton>Duyệt đổi tài khoản</SubmitButton>
              </ActionForm>
            )}
            <ActionForm
              action={decideAccountSwap.bind(null, swap.id)}
              confirm="Từ chối yêu cầu đổi tài khoản này?"
              className="space-y-3"
            >
              <input type="hidden" name="decision" value="rejected" />
              <Field htmlFor={`reject-note-${swap.id}`} label="Từ chối">
                <textarea
                  id={`reject-note-${swap.id}`}
                  name="note"
                  className="field"
                  rows={2}
                  required
                  maxLength={SWAP_REASON_MAX}
                  placeholder="Lý do (người tổ chức sẽ thấy)"
                />
              </Field>
              <SubmitButton className="btn-danger">Từ chối</SubmitButton>
            </ActionForm>
          </ItemActions>
        ))}
    </ItemCard>
  )
}
