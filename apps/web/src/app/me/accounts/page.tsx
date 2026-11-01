import type { Metadata } from "next"
import Link from "next/link"

import { AccountStatusBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { BANKS, bankLabel } from "@/lib/banks"
import { getOrganizer, listMyCampaigns, VERIFICATION_LABELS, type Organizer } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import {
  ACCOUNT_KIND_LABELS,
  accountUnusableReason,
  activeBinding,
  bindRefusalReason,
  canAskRelease,
  listMyAccounts,
  normalizePersonName,
  VERIFICATION_TRANSFER_AMOUNT,
  type ReceivingAccount,
} from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { bindAccount, registerAccount, releaseAccount } from "./actions"

export const metadata: Metadata = { title: "Tài khoản nhận tiền", robots: { index: false } }

export default async function MyAccountsPage() {
  const session = await requireSession("/me/accounts")
  const db = dbAs(session.accessToken)
  const organizer = await getOrganizer(db, session.user.id)

  if (!organizer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Tài khoản nhận tiền</h1>
        <div className="mt-8 card p-8 text-gray-700">
          Bạn cần tạo hồ sơ người tổ chức (tên pháp lý trùng với tên chủ tài khoản ngân hàng) trước khi khai báo tài
          khoản nhận.{" "}
          <Link href="/start" className="font-medium text-brand-600">
            Tạo hồ sơ
          </Link>
        </div>
      </div>
    )
  }

  const [accounts, campaigns] = await Promise.all([
    listMyAccounts(db, session.user.id),
    listMyCampaigns(db, session.user.id),
  ])
  const campaignById = new Map(campaigns.map((c) => [c.id, c]))
  // Only the organizer's own accounts can be bound to their campaigns, so
  // their bindings tell which campaigns already have an account.
  const campaignsWithAccount = new Set(
    accounts.map((a) => activeBinding(a)?.campaign_id).filter((id): id is string => Boolean(id))
  )
  const bindChoices: BindChoice[] = campaigns.map((c) => ({
    id: c.id,
    title: c.title,
    disabledReason: bindRefusalReason(c.status, campaignsWithAccount.has(c.id)),
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Tài khoản nhận tiền</h1>
        <p className="mt-2 text-gray-600">
          Tiền ủng hộ đi thẳng vào tài khoản ngân hàng của bạn; Give không giữ tiền. Mỗi tài khoản cần được xác minh là
          của bạn, rồi gắn với một chiến dịch.
        </p>
      </div>

      <section className="space-y-1 card p-6 text-sm">
        <p>
          Tên pháp lý: <span className="font-semibold">{organizer.legal_name}</span>
        </p>
        <p>
          Hồ sơ người tổ chức:{" "}
          <span className="font-semibold">{VERIFICATION_LABELS[organizer.verification_status]}</span>
        </p>
        {organizer.verification_status !== "verified" && (
          <p className="text-amber-800">
            Give chỉ xác minh tài khoản nhận sau khi hồ sơ người tổ chức đã được xác minh. Bạn vẫn có thể khai báo tài
            khoản ngay bây giờ.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Tài khoản đã khai báo ({accounts.length})</h2>
        {accounts.length === 0 ? (
          <p className="card p-6 text-gray-600">Bạn chưa khai báo tài khoản nào.</p>
        ) : (
          <ul className="space-y-4">
            {accounts.map((account) => (
              <AccountItem
                key={account.id}
                account={account}
                organizer={organizer}
                boundTitle={(id) => campaignById.get(id)?.title ?? "Chiến dịch"}
                boundReleasable={(id) => canAskRelease(campaignById.get(id)?.status, campaignById.get(id)?.type)}
                bindChoices={bindChoices}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Khai báo tài khoản mới</h2>
        <p className="mb-4 text-sm text-gray-600">
          Dùng một tài khoản riêng cho việc gây quỹ, đứng tên bạn, không dùng chung với tài khoản chi tiêu cá nhân. Với
          chiến dịch thiên tai, dịch bệnh, sự cố, mỗi chiến dịch cần một tài khoản riêng.
        </p>
        <ActionForm action={registerAccount} resetOnSuccess className="space-y-4 card p-6">
          <div>
            <label htmlFor="bank_bin" className="label">
              Ngân hàng
            </label>
            <select id="bank_bin" name="bank_bin" className="field" required defaultValue="">
              <option value="" disabled>
                Chọn ngân hàng
              </option>
              {BANKS.map((bank) => (
                <option key={bank.bin} value={bank.bin}>
                  {bank.shortName} – {bank.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="account_number" className="label">
              Số tài khoản
            </label>
            <input
              id="account_number"
              name="account_number"
              className="field"
              required
              autoComplete="off"
              maxLength={30}
            />
          </div>
          <div>
            <label htmlFor="account_name" className="label">
              Tên chủ tài khoản
            </label>
            <input
              id="account_name"
              name="account_name"
              className="field"
              required
              maxLength={120}
              defaultValue={normalizePersonName(organizer.legal_name)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Đúng như ngân hàng hiển thị; phải trùng với tên pháp lý (không phân biệt dấu và hoa thường).
            </p>
          </div>
          <fieldset>
            <legend className="label">Loại tài khoản</legend>
            {(["transparent_charity", "standard"] as const).map((kind) => (
              <label key={kind} className="mt-1 flex items-center gap-2 text-sm">
                <input type="radio" name="account_kind" value={kind} required /> {ACCOUNT_KIND_LABELS[kind]}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="public_statement_url" className="label">
              Trang sao kê công khai (nếu có)
            </label>
            <input
              id="public_statement_url"
              name="public_statement_url"
              type="url"
              className="field"
              maxLength={500}
              placeholder="https://"
            />
          </div>
          <SubmitButton>Khai báo tài khoản</SubmitButton>
        </ActionForm>
      </section>
    </div>
  )
}

interface BindChoice {
  id: string
  title: string
  /** Why the campaign cannot take this account now, or null when it can. */
  disabledReason: string | null
}

function AccountItem({
  account,
  organizer,
  boundTitle,
  boundReleasable,
  bindChoices,
}: {
  account: ReceivingAccount
  organizer: Organizer
  boundTitle: (campaignId: string) => string
  /** Whether the bound campaign's status lets the owner ask for a release. */
  boundReleasable: (campaignId: string) => boolean
  bindChoices: BindChoice[]
}) {
  const holder = activeBinding(account)
  // A verified account stops being usable when the organizer's identity changes.
  const unusable = account.verification_status === "verified" ? accountUnusableReason(account, organizer) : null
  const canBind = account.verification_status === "verified" && !unusable && !holder
  const anyBindable = bindChoices.some((c) => !c.disabledReason)

  return (
    <li className="space-y-4 card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 text-sm">
          {/* The owner's own page: the full number (RLS keeps other users out). */}
          <p className="font-semibold">
            {bankLabel(account.bank_bin)} · {account.account_number}
          </p>
          <p className="text-gray-600">{account.account_name}</p>
          <p className="text-gray-600">
            {account.account_kind ? ACCOUNT_KIND_LABELS[account.account_kind] : ""} · Khai báo ngày{" "}
            {formatDate(account.created_at)}
          </p>
          {account.public_statement_url && (
            <a
              href={account.public_statement_url}
              className="text-brand-600"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Trang sao kê công khai
            </a>
          )}
        </div>
        <AccountStatusBadge status={account.verification_status} />
      </div>

      {account.verification_status === "pending" && (
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Chuyển khoản xác minh</p>
          <p className="mt-1">
            Từ chính tài khoản này, chuyển{" "}
            <span className="font-semibold">{formatVnd(VERIFICATION_TRANSFER_AMOUNT)}</span> tới một tài khoản khác của
            bạn, với nội dung chuyển khoản đúng là:
          </p>
          <p className="mt-2 font-mono text-lg font-bold tracking-wider">{account.verification_code}</p>
          <p className="mt-2">
            Give đối chiếu giao dịch này trên sao kê của tài khoản (trang sao kê công khai nếu có) rồi xác minh. Nếu
            cần, đội ngũ Give sẽ liên hệ để xem biên lai.
          </p>
        </div>
      )}
      {(account.verification_status === "rejected" || account.verification_status === "disabled") &&
        account.review_note && <p className="text-sm text-red-700">Lý do: {account.review_note}</p>}

      {holder && (
        <p className="text-sm">
          Đang gắn với chiến dịch{" "}
          <Link href={`/me/campaigns/${holder.campaign_id}`} className="font-medium text-brand-600">
            {boundTitle(holder.campaign_id)}
          </Link>{" "}
          từ ngày {formatDate(holder.bound_at)}. Khi chiến dịch còn là bản nháp, hoặc là chiến dịch từ thiện được yêu
          cầu chỉnh sửa mà tài khoản chưa nhận giao dịch nào, bạn có thể nhả tài khoản để đổi tài khoản khác; ngoài ra,
          sau khi gửi duyệt, tài khoản chỉ được nhả khi chiến dịch đó đã xong hẳn phần tiền.
          {(account.verification_status === "disabled" || unusable) && (
            <span className="font-semibold text-red-700">
              {" "}
              Chiến dịch này hiện không nhận được tiền ủng hộ qua tài khoản này.
            </span>
          )}
        </p>
      )}
      {holder && boundReleasable(holder.campaign_id) && (
        <ActionForm
          action={releaseAccount.bind(null, account.id)}
          confirm="Nhả tài khoản này khỏi chiến dịch? Chiến dịch sẽ không còn tài khoản nhận cho đến khi bạn gắn tài khoản khác."
          className="border-t border-gray-100 pt-4"
        >
          <SubmitButton className="btn-secondary">Nhả tài khoản</SubmitButton>
        </ActionForm>
      )}
      {unusable && <p className="text-sm text-amber-800">Tài khoản tạm không dùng được: {unusable}</p>}

      {canBind &&
        (bindChoices.length === 0 ? (
          <p className="border-t border-gray-100 pt-4 text-sm text-gray-600">
            Tạo chiến dịch, rồi quay lại đây để gắn tài khoản trước khi gửi duyệt.{" "}
            <Link href="/start" className="font-medium text-brand-600">
              Tạo chiến dịch
            </Link>
          </p>
        ) : (
          <ActionForm
            action={bindAccount.bind(null, account.id)}
            confirm="Gắn tài khoản này với chiến dịch đã chọn? Sau khi gửi duyệt, tài khoản chỉ được nhả khi chiến dịch đã xong hẳn phần tiền, hoặc khi chiến dịch từ thiện được yêu cầu chỉnh sửa mà tài khoản chưa nhận giao dịch nào."
            className="space-y-2 border-t border-gray-100 pt-4"
          >
            <label htmlFor={`campaign-${account.id}`} className="label">
              Gắn với chiến dịch
            </label>
            <select
              id={`campaign-${account.id}`}
              name="campaign_id"
              className="field"
              required
              defaultValue=""
              disabled={!anyBindable}
            >
              <option value="" disabled>
                Chọn chiến dịch
              </option>
              {bindChoices.map((choice) => (
                <option key={choice.id} value={choice.id} disabled={Boolean(choice.disabledReason)}>
                  {choice.title}
                  {choice.disabledReason ? ` (${choice.disabledReason})` : ""}
                </option>
              ))}
            </select>
            {anyBindable ? (
              <SubmitButton className="btn-secondary">Gắn tài khoản</SubmitButton>
            ) : (
              <p className="text-sm text-gray-600">
                Chỉ gắn được tài khoản với chiến dịch chưa kết thúc (kể cả bản nháp) và chưa có tài khoản nhận khác.
              </p>
            )}
          </ActionForm>
        ))}
    </li>
  )
}
