import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AccountStatusBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { requireSession } from "@/lib/auth/session"
import { bankByBin } from "@/lib/banks"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import {
  ACCOUNT_KIND_LABELS,
  accountNameMatches,
  activeBinding,
  campaignRefs,
  FINANCE_ROLES,
  hostnameOf,
  listAccountsToReview,
  listReviewedAccounts,
  reviewOptions,
  VERIFICATION_TRANSFER_AMOUNT,
  type AccountForReview,
  type CampaignRef,
} from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { reviewAccount } from "./actions"

export const metadata: Metadata = { title: "Xác minh tài khoản nhận", robots: { index: false } }

export default async function AdminAccountsPage() {
  const session = await requireSession("/admin/accounts")
  const db = dbAs(session.accessToken)
  // Only finance and admin staff read receiving accounts (RLS); others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [pending, reviewed] = await Promise.all([listAccountsToReview(db), listReviewedAccounts(db)])
  const refs = await campaignRefs(
    db,
    [...pending, ...reviewed].map((a) => activeBinding(a)?.campaign_id).filter((id): id is string => Boolean(id))
  )

  return (
    <AdminPage
      title="Xác minh tài khoản nhận"
      intro={
        <p>
          Xác minh khi đã thấy, từ một nguồn do ngân hàng phát hành (sao kê trên trang của chính ngân hàng, hoặc biên
          lai và sao kê đã đối chiếu với ngân hàng), một giao dịch chuyển đi {formatVnd(VERIFICATION_TRANSFER_AMOUNT)}{" "}
          từ đúng số tài khoản này, nội dung đúng bằng mã xác minh, và tên người chuyển trên giao dịch trùng tên pháp lý
          của người tổ chức đã được xác minh. Tên chủ tài khoản và đường dẫn sao kê là do người tổ chức tự khai, chưa
          được kiểm chứng. Mọi thao tác được ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      <AdminSection id="pending" title="Chờ xác minh" count={pending.length}>
        {pending.length === 0 ? (
          <EmptyState title="Không có tài khoản nào chờ xác minh.">
            Tài khoản người tổ chức khai báo sẽ hiện ở đây cho tới khi được xác minh hoặc từ chối.
          </EmptyState>
        ) : (
          <ItemList>
            {pending.map((account) => (
              <AccountCard key={account.id} account={account} refs={refs} selfId={session.user.id} />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection id="reviewed" title="Đã xử lý gần đây" count={reviewed.length}>
        {reviewed.length === 0 ? (
          <EmptyState title="Chưa có tài khoản nào được xử lý." />
        ) : (
          <ItemList>
            {reviewed.map((account) => (
              <AccountCard key={account.id} account={account} refs={refs} selfId={session.user.id} />
            ))}
          </ItemList>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function AccountCard({
  account,
  refs,
  selfId,
}: {
  account: AccountForReview
  refs: Map<string, CampaignRef>
  selfId: string
}) {
  const bank = bankByBin(account.bank_bin)
  const organizer = account.organizer
  const nameMatches = accountNameMatches(account.account_name, organizer?.legal_name)
  const holder = activeBinding(account)
  const boundCampaign = holder ? refs.get(holder.campaign_id) : undefined
  const options = reviewOptions(account, organizer)
  const own = account.owner_user_id === selfId
  const status = account.verification_status

  return (
    <ItemCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-h3 break-words">
            {bank ? `${bank.shortName} – ${bank.name}` : account.bank_bin}{" "}
            <span className="font-mono font-medium text-fg">{account.account_number}</span>
          </h3>
          <p className="mt-1 text-sm text-muted">BIN {account.bank_bin}</p>
        </div>
        <AccountStatusBadge status={status} />
      </div>
      <Facts columns={2}>
        <Fact label="Tên chủ tài khoản (người tổ chức khai)">
          <span className="flex flex-wrap items-center gap-2">
            {account.account_name}
            {nameMatches ? (
              <span className="text-sm text-muted">(tên khai trùng tên pháp lý)</span>
            ) : (
              <Badge tone="danger">✗ tên khai không trùng tên pháp lý</Badge>
            )}
          </span>
        </Fact>
        <Fact label="Người tổ chức">
          {organizer ? (
            <span className="flex flex-wrap items-center gap-2">
              {organizer.display_name} (tên pháp lý: {organizer.legal_name})
              {organizer.phone ? ` · ${organizer.phone}` : ""}
              <VerificationBadge status={organizer.verification_status} />
            </span>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label="Loại">{account.account_kind ? ACCOUNT_KIND_LABELS[account.account_kind] : "—"}</Fact>
        <Fact label="Khai báo">{formatDate(account.created_at)}</Fact>
        {account.public_statement_url && (
          <Fact
            wide
            label={
              <>
                Sao kê công khai (người tổ chức cung cấp, chưa kiểm chứng; tên miền:{" "}
                <span className="font-semibold text-fg">{hostnameOf(account.public_statement_url)}</span>)
              </>
            }
          >
            <a
              href={account.public_statement_url}
              className="link break-all"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {account.public_statement_url}
              <span className="sr-only"> (mở thẻ mới)</span>
            </a>
          </Fact>
        )}
        {status === "pending" && (
          <Fact label="Giao dịch cần thấy" wide>
            Chuyển đi {formatVnd(VERIFICATION_TRANSFER_AMOUNT)}, nội dung{" "}
            <span className="rounded bg-surface px-2 font-mono font-bold break-all">{account.verification_code}</span>
          </Fact>
        )}
        {account.review_note && (
          <Fact label="Lý do" wide>
            {account.review_note}
          </Fact>
        )}
        {status === "verified" && <Fact label="Xác minh ngày">{formatDate(account.verified_at)}</Fact>}
        <Fact label="Chiến dịch đang gắn" wide>
          {holder ? (boundCampaign?.title ?? holder.campaign_id) : "Chưa gắn"}
        </Fact>
      </Facts>

      {own ? (
        <Callout tone="warning">Đây là tài khoản của bạn; một nhân viên khác cần xử lý.</Callout>
      ) : (
        <ItemActions>
          {status === "pending" && options.verifyBlocked && (
            <Callout tone="warning">Chưa xác minh được: {options.verifyBlocked}</Callout>
          )}
          {status === "pending" && !options.verifyBlocked && (
            <ActionForm
              action={reviewAccount.bind(null, account.id)}
              confirm="Xác minh tài khoản này? Sau đó người tổ chức có thể gắn nó với chiến dịch để nhận tiền."
              className="space-y-6"
            >
              <input type="hidden" name="decision" value="verified" />
              <input type="hidden" name="expected_code" value={account.verification_code} />
              <Field
                htmlFor={`sender-${account.id}`}
                label="Tên người chuyển trên giao dịch (đọc từ nguồn của ngân hàng)"
              >
                <input id={`sender-${account.id}`} name="sender_name" className="field" required maxLength={120} />
              </Field>
              <Field htmlFor={`evidence-${account.id}`} label="Bằng chứng giao dịch xác minh">
                <textarea
                  id={`evidence-${account.id}`}
                  name="evidence"
                  className="field"
                  rows={2}
                  required
                  maxLength={350}
                  placeholder="Mã giao dịch ngân hàng, ngày giờ, nguồn (trang sao kê của ngân hàng, biên lai đã đối chiếu)"
                />
              </Field>
              <SubmitButton>Xác minh</SubmitButton>
            </ActionForm>
          )}
          {options.close && (
            <ActionForm
              action={reviewAccount.bind(null, account.id)}
              confirm={
                options.close === "rejected"
                  ? "Từ chối tài khoản này? Số tài khoản sẽ được giải phóng để khai báo lại."
                  : "Khóa tài khoản này? Chiến dịch đang gắn với nó sẽ không nhận được tiền ủng hộ mới."
              }
              className="space-y-4"
            >
              {/* Rejecting frees the number; an account that was ever bound can only be disabled. */}
              <input type="hidden" name="decision" value={options.close} />
              <Field
                htmlFor={`reason-${account.id}`}
                label={options.close === "rejected" ? "Từ chối" : "Khóa tài khoản"}
              >
                <textarea
                  id={`reason-${account.id}`}
                  name="reason"
                  className="field"
                  rows={2}
                  required
                  maxLength={1000}
                  placeholder="Lý do (người tổ chức sẽ thấy)"
                />
              </Field>
              <SubmitButton className="btn-danger">{options.close === "rejected" ? "Từ chối" : "Khóa"}</SubmitButton>
            </ActionForm>
          )}
          {options.reopen && (
            <ActionForm
              action={reviewAccount.bind(null, account.id)}
              confirm="Mở lại tài khoản để xác minh? Người tổ chức sẽ nhận mã xác minh mới."
              className="space-y-2"
            >
              <input type="hidden" name="decision" value="pending" />
              <p className="label">Mở lại</p>
              <p className="text-sm text-muted">Người tổ chức sẽ nhận mã xác minh mới.</p>
              <SubmitButton className="btn-secondary">Mở lại để xác minh</SubmitButton>
            </ActionForm>
          )}
        </ItemActions>
      )}
    </ItemCard>
  )
}
