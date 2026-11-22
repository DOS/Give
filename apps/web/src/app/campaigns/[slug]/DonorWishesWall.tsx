import Link from "next/link"

import { WishHeartButton } from "@/components/campaign/WishHeartButton"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink, buttonClass } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { FlagIcon, HeartIcon } from "@/components/ui/icons"
import {
  campaignWishesHref,
  WISH_HIDDEN_ROLE_LABELS,
  WISH_REASON_MAX,
  wishDonorInitial,
  wishDonorName,
  WISHES_PAGE_SIZE,
  type CampaignWishRow,
  type HiddenCampaignWishRow,
} from "@/lib/donor-wishes"
import { formatDateTime, formatVnd } from "@/lib/format"

import { moderateWishFromCampaign, reportWish, toggleWishHeart } from "./wish-actions"

const DISCLOSURE_SUMMARY_CLASS =
  "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded text-sm font-medium text-muted hover:text-fg hover:underline [&::-webkit-details-marker]:hidden"

/**
 * Public "Tường lời chúc" section on `/campaigns/[slug]` (DOS/Give#320).
 *
 * Rendered strictly on public live/ended campaigns (`isPublicLiveOrEnded`) —
 * never on pre-launch teasers or private previews. All wish bodies are
 * rendered strictly as React plain text (zero HTML/Markdown/XSS).
 */
export function DonorWishesWall({
  slug,
  wishes,
  totalCount,
  page,
  signedIn,
  loginHref,
  canHideWishes,
  canViewHiddenWishes,
  showHidden,
  hiddenWishes,
}: {
  slug: string
  wishes: readonly CampaignWishRow[]
  totalCount: number
  page: number
  signedIn: boolean
  loginHref: string
  canHideWishes: boolean
  canViewHiddenWishes: boolean
  showHidden: boolean
  hiddenWishes: readonly HiddenCampaignWishRow[]
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / WISHES_PAGE_SIZE))

  return (
    <section id="tuong-loi-chuc" aria-labelledby="wishes-heading" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 id="wishes-heading" className="flex flex-wrap items-center gap-3 text-h2">
            Tường lời chúc
            {totalCount > 0 && (
              <Badge size="md" className="tabular-nums">
                {totalCount}
              </Badge>
            )}
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm text-muted">
            Những lời chúc gửi chiến dịch sau khi khoản ủng hộ được khớp sao kê.
          </p>
        </div>
        {canViewHiddenWishes && (
          <Link
            href={campaignWishesHref(slug, { page, showHidden: !showHidden })}
            className="hit-area shrink-0 text-sm font-semibold text-primary hover:underline"
          >
            {showHidden ? "Ẩn mục lời chúc đã ẩn" : "Xem lời chúc đã ẩn"}
          </Link>
        )}
      </div>

      {wishes.length === 0 ? (
        page === 1 && totalCount === 0 ? (
          <EmptyState title="Chưa có lời chúc nào" icon={<HeartIcon width={40} height={40} />}>
            Lời chúc của người ủng hộ sẽ hiển thị tại đây ngay khi giao dịch được khớp sao kê.
          </EmptyState>
        ) : (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <p className="text-muted">Trang này không có lời chúc.</p>
            <ButtonLink href={campaignWishesHref(slug, { page: 1, showHidden })} variant="secondary">
              Về trang lời chúc đầu tiên
            </ButtonLink>
          </div>
        )
      ) : (
        <ol className="mt-6 divide-y divide-border border-t border-border">
          {wishes.map((wish) => (
            <li key={wish.contribution_id} className="py-6">
              <WishItem
                wish={wish}
                slug={slug}
                signedIn={signedIn}
                loginHref={loginHref}
                canHideWishes={canHideWishes}
              />
            </li>
          ))}
        </ol>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Phân trang tường lời chúc"
          className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
        >
          <p className="text-sm text-muted tabular-nums">
            Trang {page} / {totalPages} ({totalCount} lời chúc)
          </p>
          <div className="flex flex-wrap gap-2">
            {page > 1 && (
              <ButtonLink href={campaignWishesHref(slug, { page: page - 1, showHidden })} variant="secondary">
                Trang trước
              </ButtonLink>
            )}
            {page < totalPages && (
              <ButtonLink href={campaignWishesHref(slug, { page: page + 1, showHidden })} variant="secondary">
                Trang sau
              </ButtonLink>
            )}
          </div>
        </nav>
      )}

      {canViewHiddenWishes && showHidden && (
        <div className="mt-8 rounded-md bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3">Lời chúc đã ẩn</h3>
            <Badge tone="warning" className="tabular-nums">
              {hiddenWishes.length}
            </Badge>
          </div>
          <p className="mt-2 max-w-[68ch] text-sm text-muted">
            Số tiền ủng hộ vẫn giữ nguyên trên sao kê công khai; chỉ nội dung lời chúc bị ẩn khỏi Tường lời chúc.
          </p>
          {hiddenWishes.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Chưa có lời chúc nào bị ẩn trên chiến dịch này.</p>
          ) : (
            <ol className="mt-4 divide-y divide-border border-t border-border">
              {hiddenWishes.map((item) => (
                <li key={item.contribution_id} className="py-4">
                  <HiddenWishItem item={item} slug={slug} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

function WishItem({
  wish,
  slug,
  signedIn,
  loginHref,
  canHideWishes,
}: {
  wish: CampaignWishRow
  slug: string
  signedIn: boolean
  loginHref: string
  canHideWishes: boolean
}) {
  const donorLabel = wishDonorName(wish.display_name, wish.is_anonymous)

  return (
    <div className="flex items-start gap-3">
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-surface text-sm font-bold text-muted"
        aria-hidden
      >
        {wishDonorInitial(wish.display_name, wish.is_anonymous)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={wish.is_anonymous ? "font-medium text-muted" : "font-semibold break-words text-fg"}>
            {donorLabel}
          </span>
          <span className="text-sm font-semibold text-primary tabular-nums">{formatVnd(wish.amount)}</span>
          <time dateTime={wish.created_at} className="text-sm text-muted tabular-nums">
            {formatDateTime(wish.created_at)}
          </time>
        </div>

        <p className="mt-2 max-w-[68ch] break-words whitespace-pre-wrap text-fg">{wish.message}</p>

        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
          <WishHeartButton
            hearted={wish.viewer_hearted}
            heartCount={wish.heart_count}
            signedIn={signedIn}
            loginHref={loginHref}
            action={toggleWishHeart.bind(null, wish.contribution_id, slug)}
          />

          {signedIn && (
            <details className="min-w-0">
              <summary className={DISCLOSURE_SUMMARY_CLASS}>
                <FlagIcon width={16} height={16} className="shrink-0" />
                <span>Báo cáo</span>
              </summary>
              <div className="mt-3 max-w-[520px] rounded-md bg-surface p-4">
                <ActionForm
                  action={reportWish.bind(null, wish.contribution_id, slug)}
                  className="space-y-4"
                  resetOnSuccess
                >
                  <Field
                    htmlFor={`wish-report-${wish.contribution_id}`}
                    hintId={`wish-report-hint-${wish.contribution_id}`}
                    label="Lý do báo cáo lời chúc"
                    hint={`Tối đa ${WISH_REASON_MAX} ký tự. Đội kiểm duyệt sẽ xem xét; số tiền ủng hộ trên sao kê không bị ảnh hưởng.`}
                  >
                    <textarea
                      id={`wish-report-${wish.contribution_id}`}
                      aria-describedby={`wish-report-hint-${wish.contribution_id}`}
                      name="reason"
                      rows={2}
                      required
                      maxLength={WISH_REASON_MAX}
                      placeholder="Ví dụ: Lời chúc chứa nội dung quảng cáo rác hoặc ngôn từ không phù hợp."
                      className="field"
                    />
                  </Field>
                  <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>Gửi báo cáo</SubmitButton>
                </ActionForm>
              </div>
            </details>
          )}

          {canHideWishes && (
            <details className="min-w-0">
              <summary className={DISCLOSURE_SUMMARY_CLASS}>Ẩn lời chúc</summary>
              <div className="mt-3 max-w-[520px] rounded-md bg-surface p-4">
                <ActionForm
                  action={moderateWishFromCampaign.bind(null, wish.contribution_id, slug)}
                  confirm="Ẩn lời chúc này khỏi trang công khai? Khoản ủng hộ vẫn hiển thị trên sao kê."
                  className="space-y-4"
                  resetOnSuccess
                >
                  <input type="hidden" name="action" value="hide" />
                  <Field
                    htmlFor={`wish-hide-${wish.contribution_id}`}
                    hintId={`wish-hide-hint-${wish.contribution_id}`}
                    label="Lý do ẩn (không bắt buộc)"
                    hint={`Tối đa ${WISH_REASON_MAX} ký tự. Ghi vào nhật ký kiểm toán.`}
                  >
                    <textarea
                      id={`wish-hide-${wish.contribution_id}`}
                      aria-describedby={`wish-hide-hint-${wish.contribution_id}`}
                      name="reason"
                      rows={2}
                      maxLength={WISH_REASON_MAX}
                      placeholder="Ví dụ: Nội dung quảng cáo hoặc ngôn từ không phù hợp."
                      className="field"
                    />
                  </Field>
                  <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>Ẩn lời chúc</SubmitButton>
                </ActionForm>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

function HiddenWishItem({ item, slug }: { item: HiddenCampaignWishRow; slug: string }) {
  const donorLabel = wishDonorName(item.display_name, item.is_anonymous)
  const roleLabel = WISH_HIDDEN_ROLE_LABELS[item.message_hidden_role]
  const staffLocked = item.message_hidden_role === "moderator" || item.message_hidden_role === "admin"

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone="warning">Đã ẩn · {roleLabel}</Badge>
        <span className={item.is_anonymous ? "text-sm text-muted" : "text-sm font-semibold text-fg"}>{donorLabel}</span>
        <span className="text-sm font-semibold text-primary tabular-nums">{formatVnd(item.amount)}</span>
        <time dateTime={item.message_hidden_at} className="text-sm text-muted tabular-nums">
          Ẩn lúc {formatDateTime(item.message_hidden_at)}
        </time>
      </div>
      <p className="max-w-[68ch] break-words whitespace-pre-wrap text-fg">{item.message}</p>
      {item.message_hide_reason && (
        <p className="max-w-[68ch] text-sm text-muted">Lý do ẩn: {item.message_hide_reason}</p>
      )}
      {item.can_restore ? (
        <div className="pt-1">
          <ActionForm
            action={moderateWishFromCampaign.bind(null, item.contribution_id, slug)}
            confirm="Khôi phục lời chúc này để hiển thị lại trên Tường lời chúc?"
          >
            <input type="hidden" name="action" value="restore" />
            <input type="hidden" name="reason" value="" />
            <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
              Khôi phục lời chúc
            </SubmitButton>
          </ActionForm>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {staffLocked
            ? "Lời chúc này do đội kiểm duyệt ẩn nên chỉ kiểm duyệt viên hoặc quản trị viên khác mới có thể khôi phục."
            : "Bạn không thể tự khôi phục lời chúc này."}
        </p>
      )}
    </div>
  )
}
