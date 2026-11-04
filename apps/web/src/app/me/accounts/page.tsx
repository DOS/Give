import type { Metadata } from "next"
import Link from "next/link"

import { AccountStatusBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { BankIcon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/PageHeader"
import { requireSession } from "@/lib/auth/session"
import { BANKS, bankLabel } from "@/lib/banks"
import { getOrganizer, listMyCampaigns, type Organizer } from "@/lib/campaigns"
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

import { MePage } from "../_components/MePage"
import { checkInputClass, checkLabelClass } from "../_components/Panel"

import { bindAccount, registerAccount, releaseAccount } from "./actions"

export const metadata: Metadata = { title: "Tài khoản nhận tiền", robots: { index: false } }

export default async function MyAccountsPage() {
  const session = await requireSession("/me/accounts")
  const db = dbAs(session.accessToken)
  const organizer = await getOrganizer(db, session.user.id)

  if (!organizer) {
    return (
      <MePage section="accounts">
        <PageHeader title="Tài khoản nhận tiền" />
        <EmptyState title="Bạn chưa có hồ sơ người tổ chức." action={<ButtonLink href="/start">Tạo hồ sơ</ButtonLink>}>
          Bạn cần tạo hồ sơ người tổ chức (tên pháp lý trùng với tên chủ tài khoản ngân hàng) trước khi khai báo tài
          khoản nhận.
        </EmptyState>
      </MePage>
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
    <MePage section="accounts">
      <PageHeader
        title="Tài khoản nhận tiền"
        actions={
          <ButtonLink href="/me/statements" variant="secondary">
            Tải sao kê
          </ButtonLink>
        }
      >
        Tiền ủng hộ đi thẳng vào tài khoản ngân hàng của bạn; Give không giữ tiền. Mỗi tài khoản cần được xác minh là
        của bạn, rồi gắn với một chiến dịch.
      </PageHeader>

      <section aria-label="Hồ sơ người tổ chức" className="card p-5 sm:p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Tên pháp lý</dt>
            <dd className="mt-1 text-lg font-semibold break-words text-ink">{organizer.legal_name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Hồ sơ người tổ chức</dt>
            <dd className="mt-1">
              <VerificationBadge status={organizer.verification_status} />
            </dd>
          </div>
        </dl>
        {organizer.verification_status !== "verified" && (
          <Callout tone="warning" className="mt-4">
            Give chỉ xác minh tài khoản nhận sau khi hồ sơ người tổ chức đã được xác minh. Bạn vẫn có thể khai báo tài
            khoản ngay bây giờ.
          </Callout>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <section aria-labelledby="accounts-heading">
          <h2 id="accounts-heading" className="mb-4 text-xl font-semibold tracking-tight">
            Tài khoản đã khai báo ({accounts.length})
          </h2>
          {accounts.length === 0 ? (
            <EmptyState title="Bạn chưa khai báo tài khoản nào.">
              Khai báo tài khoản ở mục Khai báo tài khoản mới, rồi chuyển khoản xác minh để Give xác nhận tài khoản là
              của bạn.
            </EmptyState>
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

        <section aria-labelledby="new-account-heading" className="card p-5 sm:p-6">
          <h2 id="new-account-heading" className="text-xl font-semibold tracking-tight">
            Khai báo tài khoản mới
          </h2>
          <p className="mt-1 text-body">
            Dùng một tài khoản riêng cho việc gây quỹ, đứng tên bạn, không dùng chung với tài khoản chi tiêu cá nhân.
            Với chiến dịch thiên tai, dịch bệnh, sự cố, mỗi chiến dịch cần một tài khoản riêng.
          </p>
          <ActionForm action={registerAccount} resetOnSuccess className="mt-5 space-y-5">
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
                aria-describedby="account_name_hint"
                defaultValue={normalizePersonName(organizer.legal_name)}
              />
              <p id="account_name_hint" className="hint">
                Đúng như ngân hàng hiển thị; phải trùng với tên pháp lý (không phân biệt dấu và hoa thường).
              </p>
            </div>
            <fieldset>
              <legend className="label">Loại tài khoản</legend>
              {(["transparent_charity", "standard"] as const).map((kind) => (
                <label key={kind} className={checkLabelClass}>
                  <input type="radio" name="account_kind" value={kind} required className={checkInputClass} />{" "}
                  {ACCOUNT_KIND_LABELS[kind]}
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
            <SubmitButton className={buttonClass({ full: true })}>Khai báo tài khoản</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </MePage>
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
    <li className="space-y-4 card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          <span
            aria-hidden
            className="hidden size-11 shrink-0 items-center justify-center rounded bg-surface text-muted sm:flex"
          >
            <BankIcon width={22} height={22} />
          </span>
          <div className="min-w-0">
            {/* The owner's own page: the full number (RLS keeps other users out). */}
            <p className="text-lg font-semibold break-words text-ink">
              {bankLabel(account.bank_bin)} · <span className="tabular-nums">{account.account_number}</span>
            </p>
            <p className="text-body">{account.account_name}</p>
            <p className="text-sm text-muted">
              {account.account_kind ? ACCOUNT_KIND_LABELS[account.account_kind] : ""} · Khai báo ngày{" "}
              {formatDate(account.created_at)}
            </p>
            {account.public_statement_url && (
              <a
                href={account.public_statement_url}
                className="inline-flex min-h-11 items-center link"
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Trang sao kê công khai
              </a>
            )}
          </div>
        </div>
        <AccountStatusBadge status={account.verification_status} />
      </div>

      {account.verification_status === "pending" && (
        <Callout tone="warning" title="Chuyển khoản xác minh">
          <p>
            Từ chính tài khoản này, chuyển{" "}
            <span className="font-semibold">{formatVnd(VERIFICATION_TRANSFER_AMOUNT)}</span> tới một tài khoản khác của
            bạn, với nội dung chuyển khoản đúng là:
          </p>
          <p className="my-3 inline-block rounded border border-amber-300 bg-white px-3 py-1.5 font-mono text-xl font-bold tracking-wider break-all text-ink">
            {account.verification_code}
          </p>
          <p>
            Give đối chiếu giao dịch này trên sao kê của tài khoản (trang sao kê công khai nếu có) rồi xác minh. Nếu
            cần, đội ngũ Give sẽ liên hệ để xem biên lai.
          </p>
        </Callout>
      )}
      {(account.verification_status === "rejected" || account.verification_status === "disabled") &&
        account.review_note && (
          <Callout tone="danger" className="break-words">
            Lý do: {account.review_note}
          </Callout>
        )}

      {holder && (
        <div className="border-t border-line pt-4 text-body">
          <p>
            Đang gắn với chiến dịch{" "}
            <Link href={`/me/campaigns/${holder.campaign_id}`} className="link">
              {boundTitle(holder.campaign_id)}
            </Link>{" "}
            từ ngày {formatDate(holder.bound_at)}.
          </p>
          <p className="mt-1 text-sm text-muted">
            Khi chiến dịch còn là bản nháp, hoặc được yêu cầu chỉnh sửa mà tài khoản chưa nhận giao dịch nào, bạn có thể
            nhả tài khoản để đổi tài khoản khác; ngoài ra, sau khi gửi duyệt, tài khoản chỉ được nhả khi chiến dịch đó
            đã xong hẳn phần tiền.
          </p>
          {(account.verification_status === "disabled" || unusable) && (
            <p className="mt-2 font-semibold text-red-700">
              Chiến dịch này hiện không nhận được tiền ủng hộ qua tài khoản này.
            </p>
          )}
        </div>
      )}
      {holder && boundReleasable(holder.campaign_id) && (
        <ActionForm
          action={releaseAccount.bind(null, account.id)}
          confirm="Nhả tài khoản này khỏi chiến dịch? Chiến dịch sẽ không còn tài khoản nhận cho đến khi bạn gắn tài khoản khác."
        >
          <SubmitButton className={buttonClass({ variant: "secondary" })}>Nhả tài khoản</SubmitButton>
        </ActionForm>
      )}
      {unusable && <Callout tone="warning">Tài khoản tạm không dùng được: {unusable}</Callout>}

      {canBind &&
        (bindChoices.length === 0 ? (
          <p className="border-t border-line pt-4 text-body">
            Tạo chiến dịch, rồi quay lại đây để gắn tài khoản trước khi gửi duyệt.{" "}
            <Link href="/start" className="link">
              Tạo chiến dịch
            </Link>
          </p>
        ) : (
          <ActionForm
            action={bindAccount.bind(null, account.id)}
            confirm="Gắn tài khoản này với chiến dịch đã chọn? Sau khi gửi duyệt, tài khoản chỉ được nhả khi chiến dịch đã xong hẳn phần tiền, hoặc khi chiến dịch được yêu cầu chỉnh sửa mà tài khoản chưa nhận giao dịch nào."
            className="border-t border-line pt-4"
          >
            <label htmlFor={`campaign-${account.id}`} className="label">
              Gắn với chiến dịch
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                id={`campaign-${account.id}`}
                name="campaign_id"
                className="field sm:flex-1"
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
              {anyBindable && (
                <SubmitButton className={buttonClass({ variant: "secondary", className: "sm:shrink-0" })}>
                  Gắn tài khoản
                </SubmitButton>
              )}
            </div>
            {!anyBindable && (
              <p className="hint">
                Chỉ gắn được tài khoản với chiến dịch chưa kết thúc (kể cả bản nháp) và chưa có tài khoản nhận khác.
              </p>
            )}
          </ActionForm>
        ))}
    </li>
  )
}
