import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { StatusBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { requireSession } from "@/lib/auth/session"
import { bankLabel } from "@/lib/banks"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  listOwnTransfers,
  listSwapTransfers,
  OWN_TRANSFER_LABEL,
  OWN_TRANSFER_REASON_MAX,
  pairCandidates,
  type OwnTransfer,
  type SwapTransfers,
  type TransferLeg,
} from "@/lib/own-transfers"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, DataTable, Fact, Facts, ItemCard, ItemList } from "../_components/ui"
import { markOwnTransfer } from "./actions"

export const metadata: Metadata = { title: "Chuyển sang tài khoản mới", robots: { index: false } }

/**
 * Finance queue of transfers between a campaign's own accounts (DOS/Give#84):
 * after an approved account swap, the organizer moves the old account's
 * balance to the new one. Finance pairs the outgoing transaction from the old
 * account with the same money into the new one, so it counts neither as money
 * received twice nor as spending.
 */
export default async function AdminOwnTransfersPage() {
  const session = await requireSession("/admin/own-transfers")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [swaps, marked] = await Promise.all([listSwapTransfers(db), listOwnTransfers(db)])
  const outCount = swaps.reduce((n, s) => n + s.outs.length, 0)

  return (
    <AdminPage
      title="Chuyển sang tài khoản mới"
      intro={
        <>
          <p>
            Sau khi đổi tài khoản nhận, người tổ chức thường chuyển số dư còn ở tài khoản cũ sang tài khoản mới. Sao kê
            ghi hai giao dịch: tiền ra ở tài khoản cũ (như một khoản chi chờ giải trình) và tiền vào ở tài khoản mới
            (như tiền chưa khớp), nên cùng một khoản tiền bị tính hai lần vào tổng đã nhận và một lần vào đã chi.
          </p>
          <p>
            Đối chiếu sao kê của cả hai tài khoản (cùng số tiền, người chuyển và người nhận là hai tài khoản của chiến
            dịch), rồi đánh dấu cặp giao dịch. Cặp đã đánh dấu không còn tính vào đã nhận hay đã chi, và sao kê công
            khai ghi “{OWN_TRANSFER_LABEL}”. Căn cứ bạn ghi chỉ nhân viên xem được. Không hoàn tác được. Khoản tiền ra
            nào là chi tiêu thật thì để người tổ chức giải trình như thường.
          </p>
        </>
      }
    >
      <AdminSection id="open" title="Tiền ra ở tài khoản cũ chưa giải trình" count={outCount}>
        {swaps.length === 0 ? (
          <EmptyState title="Không có khoản nào cần đối chiếu.">
            Tiền ra khỏi tài khoản cũ sau một lần đổi tài khoản đã duyệt sẽ hiện ở đây.
          </EmptyState>
        ) : (
          <ItemList>
            {swaps.map((swap) => (
              <SwapCard key={swap.swap_id} swap={swap} selfId={session.user.id} />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <MarkedPairs pairs={marked} />
    </AdminPage>
  )
}

function accountText(account: SwapTransfers["old_account"]): string {
  if (!account) return "—"
  return `${bankLabel(account.bank_bin)} · ${account.account_number} · ${account.account_name}`
}

function bookedText(leg: Pick<TransferLeg, "booked_at" | "booked_date_only">): string {
  return leg.booked_date_only ? formatDate(leg.booked_at) : formatDateTime(leg.booked_at)
}

function shorten(text: string, max = 60): string {
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text
}

function optionText(leg: TransferLeg): string {
  const from = leg.counterparty_name ?? "không rõ người chuyển"
  const note = leg.description ? ` · ${shorten(leg.description)}` : ""
  return `${bookedText(leg)} · ${formatVnd(leg.amount)} · ${from}${note}`
}

function SwapCard({ swap, selfId }: { swap: SwapTransfers; selfId: string }) {
  const campaign = swap.campaign
  // The new account's owner is the campaign's organizer (give.decide_account_swap requires it).
  const own = swap.new_account?.owner_user_id === selfId || swap.old_account?.owner_user_id === selfId

  return (
    <ItemCard>
      <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-h3 break-words">
        {campaign ? (
          <>
            {campaign.title}
            <StatusBadge status={campaign.status} />
          </>
        ) : (
          swap.campaign_id
        )}
      </h3>
      <Facts columns={2}>
        <Fact label="Tài khoản cũ">{accountText(swap.old_account)}</Fact>
        <Fact label="Tài khoản mới">{accountText(swap.new_account)}</Fact>
        <Fact label="Đổi tài khoản lúc">{formatDateTime(swap.decided_at)}</Fact>
        <Fact label="Tiền vào chưa khớp ở tài khoản mới">{swap.ins.length} giao dịch</Fact>
      </Facts>

      {own ? (
        <Callout tone="warning">Đây là chiến dịch của bạn; một nhân viên khác cần đối chiếu.</Callout>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {swap.outs.map((out) => (
            <OutLeg key={out.id} out={out} candidates={pairCandidates(out, swap.ins)} />
          ))}
        </ul>
      )}
    </ItemCard>
  )
}

function OutLeg({ out, candidates }: { out: TransferLeg; candidates: TransferLeg[] }) {
  const selectId = `in-${out.id}`
  const reasonId = `reason-${out.id}`
  return (
    <li className="space-y-4 pt-6 [&:not(:last-child)]:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-muted">{bookedText(out)} · Tiền ra khỏi tài khoản cũ</p>
          <p className="break-words text-fg">
            {out.counterparty_name ?? "Không rõ người nhận"}
            {out.counterparty_account_masked && (
              <span className="ml-2 text-sm text-muted">TK {out.counterparty_account_masked}</span>
            )}
          </p>
          {out.description && <p className="text-sm break-words text-muted">{out.description}</p>}
        </div>
        <p className="shrink-0 font-semibold text-fg tabular-nums">−{formatVnd(out.amount)}</p>
      </div>

      {candidates.length === 0 ? (
        <Callout tone="info">
          Chưa có khoản tiền vào cùng số tiền ở tài khoản mới. Sao kê của tài khoản mới có thể chưa được tải lên; nếu
          đây là chi tiêu thật, người tổ chức giải trình như một khoản chi.
        </Callout>
      ) : (
        <ActionForm
          action={markOwnTransfer.bind(null, out.id)}
          confirm={`Đánh dấu khoản ${formatVnd(out.amount)} này và khoản tiền vào đã chọn là tiền chuyển sang tài khoản mới của chiến dịch? Không hoàn tác được.`}
          className="space-y-4"
        >
          <Field
            htmlFor={selectId}
            label="Khoản tiền vào tương ứng ở tài khoản mới"
            hint="Chỉ hiện các khoản cùng số tiền, gần ngày nhất ở trên."
          >
            <select id={selectId} name="in_transaction_id" className="field" required defaultValue="">
              <option value="" disabled>
                Chọn một khoản tiền vào
              </option>
              {candidates.map((leg) => (
                <option key={leg.id} value={leg.id}>
                  {optionText(leg)}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor={reasonId} label="Căn cứ đã kiểm tra (chỉ nhân viên xem được)">
            <textarea
              id={reasonId}
              name="reason"
              className="field"
              rows={2}
              required
              maxLength={OWN_TRANSFER_REASON_MAX}
              placeholder="Ví dụ: sao kê hai tài khoản cùng ngày, người tổ chức báo chuyển số dư"
            />
          </Field>
          <SubmitButton>Đánh dấu là chuyển sang tài khoản mới</SubmitButton>
        </ActionForm>
      )}
    </li>
  )
}

function MarkedPairs({ pairs }: { pairs: OwnTransfer[] }) {
  return (
    <AdminSection
      id="marked"
      title="Đã đánh dấu gần đây"
      count={pairs.length}
      lead="Mỗi lần đánh dấu được ghi vào nhật ký kiểm toán."
    >
      {pairs.length === 0 ? (
        <EmptyState title="Chưa có cặp nào được đánh dấu." />
      ) : (
        <DataTable
          label="Các cặp chuyển sang tài khoản mới"
          head={["Chiến dịch", "Số tiền", "Tiền ra / tiền vào", "Căn cứ", "Đánh dấu lúc"]}
        >
          {pairs.map((pair) => (
            <tr key={pair.id}>
              <td className="max-w-48 px-4 py-3 break-words">{pair.campaign?.title ?? pair.campaign_id}</td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                {pair.out_tx ? formatVnd(pair.out_tx.amount) : "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {pair.out_tx ? bookedText(pair.out_tx) : "—"}
                <br />
                {pair.in_tx ? bookedText(pair.in_tx) : "—"}
              </td>
              <td className="max-w-md px-4 py-3 break-words whitespace-pre-line">{pair.reason}</td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(pair.marked_at)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </AdminSection>
  )
}
