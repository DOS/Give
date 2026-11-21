import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import { AccountStatusBadge, StatusBadge, TypeBadge } from "@/components/badges"
import {
  listStatusEventsByCampaign,
  StatusHistory,
  type CampaignStatusEvent,
} from "@/components/campaign/StatusHistory"
import { ContactEmailLink, ContactText } from "@/components/ContactText"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Callout, type CalloutTone } from "@/components/ui/Callout"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { BankIcon, ChevronDownIcon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/PageHeader"
import { TabNav } from "@/components/ui/Tabs"
import {
  analyticsTabHref,
  getCampaignAnalytics,
  parseAnalyticsDays,
  parseCampaignManageTab,
  type CampaignAnalytics,
} from "@/lib/analytics"
import { requireSession } from "@/lib/auth/session"
import { dbErrorMessage, giveErrorCode, type DbErrorLike } from "@/lib/errors"
import { bankLabel } from "@/lib/banks"
import { canAskSwap, lastDecidedSwap, pendingSwap, SWAP_REASON_MAX, type AccountSwapRequest } from "@/lib/account-swaps"
import {
  canPickAccount,
  loadEditorAccounts,
  openingBlock,
  type AccountChoice,
  type EditorAccounts,
} from "@/lib/campaign-account"
import {
  canPostUpdate,
  type CampaignStatus,
  type CampaignType,
  type CampaignUpdate,
  categoriesFor,
  type Db,
  getCampaignById,
  isEditableStatus,
  isPublicStatus,
  listAllUpdates,
  listCategories,
  listMilestones,
  type Milestone,
  organizerCanCancel,
} from "@/lib/campaigns"
import { VIA_CONTACT_EMAIL } from "@/lib/contact"
import { formatDate, formatDateTime, formatVnd, toVietnamLocalInput } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { privateCoverUrl } from "@/lib/cover-urls"
import { canUpdateFulfillment } from "@/lib/fulfillment"
import { canAskRelease, isBindableStatus, type ReceivingAccount } from "@/lib/receiving-accounts"
import { listCampaignTiers } from "@/lib/reward-tiers"
import { getMoneyTotals } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import { MeDetail } from "../../_components/MePage"
import { checkInputClass, checkLabelClass, fileInputClass, Panel } from "../../_components/Panel"
import { bindAccount, releaseAccount } from "../../accounts/actions"
import { cancelAccountSwap, requestAccountSwap } from "../swap-actions"

import { AnalyticsTab } from "./AnalyticsTab"
import {
  campaignAllowsMonthly,
  loadPlanSupporters,
  MonthlySection,
  showMonthlySection,
  type PlanSupporter,
} from "./MonthlySection"
import { FulfillmentLink, RewardTiersSection } from "./RewardTiersSection"

import {
  addMilestone,
  cancelCampaign,
  deleteDraft,
  deleteDraftUpdate,
  deleteMilestone,
  postUpdate,
  publishDraftUpdate,
  removeYoutubeVideo,
  saveContent,
  saveYoutubeVideo,
  submitForReview,
  updateDraftUpdate,
  updateMilestone,
  uploadCover,
} from "../actions"

export const metadata: Metadata = { title: "Quản lý chiến dịch", robots: { index: false } }

interface YoutubeMedia {
  id: string
  youtube_id: string
  alt: string | null
}

async function loadYoutubeVideo(db: Db, campaignId: string): Promise<{ video: YoutubeMedia | null }> {
  const { data, error } = await db
    .from("campaign_media")
    .select("id, youtube_id, alt")
    .eq("campaign_id", campaignId)
    .eq("kind", "youtube")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
  if (error) throw error
  const row = ((data ?? []) as { id: string; youtube_id: string | null; alt: string | null }[])[0]
  if (!row?.youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(row.youtube_id)) return { video: null }
  return { video: { id: row.id, youtube_id: row.youtube_id, alt: row.alt ?? null } }
}

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const tab = parseCampaignManageTab(resolvedSearch.tab)
  const days = parseAnalyticsDays(resolvedSearch.days)
  const returnPath = tab === "analytics" ? analyticsTabHref(id, days) : `/me/campaigns/${id}`
  const session = await requireSession(returnPath)
  if (!isUuid(id)) notFound()
  const db = dbAs(session.accessToken)
  const campaign = await getCampaignById(db, id)
  if (!campaign || campaign.organizer_id !== session.user.id) notFound()

  const headerAndTabs = (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/me/campaigns", label: "Chiến dịch của tôi" }}
        eyebrow={
          <>
            <TypeBadge type={campaign.type} />
            <StatusBadge status={campaign.status} />
          </>
        }
        title={campaign.title}
        actions={
          <ButtonLink href={`/campaigns/${campaign.slug}`} variant="secondary">
            {isPublicStatus(campaign.status) ? "Xem trang công khai" : "Xem trước trang chiến dịch"}
          </ButtonLink>
        }
      />
      <TabNav
        label="Mục chiến dịch"
        items={[
          { href: `/me/campaigns/${campaign.id}`, label: "Quản lý", current: tab === "manage" },
          { href: analyticsTabHref(campaign.id), label: "Thống kê", current: tab === "analytics" },
        ]}
      />
    </div>
  )

  if (tab === "analytics") {
    let analytics: CampaignAnalytics | null = null
    let analyticsError: string | null = null
    try {
      analytics = await getCampaignAnalytics(db, campaign.id, days)
    } catch (error) {
      const dbError = error as DbErrorLike | null
      if (giveErrorCode(dbError) === "GIVE_CAMPAIGN_NOT_FOUND" || dbError?.code === "P0002") {
        notFound()
      }
      analyticsError = dbErrorMessage(dbError)
    }

    return (
      <MeDetail>
        {headerAndTabs}
        <AnalyticsTab
          campaignId={campaign.id}
          campaignType={campaign.type}
          campaignStatus={campaign.status}
          days={days}
          analytics={analytics}
          error={analyticsError}
        />
      </MeDetail>
    )
  }

  const isGive = campaign.type === "give"
  const showMonthly = showMonthlySection(campaign.type, campaign.status)
  const allowMonthly = campaignAllowsMonthly(campaign)
  const [
    categories,
    milestones,
    updates,
    totals,
    accounts,
    tiers,
    youtubeState,
    statusEventsByCampaign,
    planSupporters,
  ] = await Promise.all([
    listCategories(db),
    listMilestones(db, campaign.id),
    listAllUpdates(db, campaign.id),
    isPublicStatus(campaign.status) ? getMoneyTotals(db, campaign.id) : Promise.resolve(null),
    // Both types need a usable account before review (DOS/Give#85). A failed
    // account read shows a notice in its section instead of failing the whole
    // editor; submitForReview still checks the account on the server.
    loadEditorAccounts(db, session.user.id, campaign.id, campaign.status, campaign.type).catch(() => null),
    // Reward tiers of a back campaign (DOS/Give#83); a failed read degrades its section only.
    isGive ? Promise.resolve(null) : listCampaignTiers(db, campaign.id).catch(() => null),
    loadYoutubeVideo(db, campaign.id).catch(() => null),
    listStatusEventsByCampaign(db, [campaign.id]).catch(() => new Map<string, CampaignStatusEvent[]>()),
    // Monthly supporters (DOS/Give#276): the service-role RPC runs only after the
    // caller's own token loaded the campaign above and they organize it; a failed
    // read degrades the monthly section only.
    showMonthly && allowMonthly
      ? loadPlanSupporters(campaign.id, session.user.id).catch(() => null)
      : Promise.resolve<PlanSupporter[] | null>([]),
  ])
  const youtubeVideo = youtubeState?.video ?? null
  const statusEvents = statusEventsByCampaign.get(campaign.id) ?? []
  const editable = isEditableStatus(campaign.status)
  const submitBlocked = accounts?.submitBlocked ?? null
  const canUpdate = canPostUpdate(campaign.status)
  const canPublish = canUpdate && !editable && campaign.status !== "in_review"
  const showUpdates = canUpdate || updates.length > 0

  const showMoney = Boolean(totals) || !editable
  const showFulfillment = !isGive && canUpdateFulfillment(campaign)
  const toc = [
    showFulfillment && { id: "fulfillment", label: "Giao quà" },
    showMoney && { id: "money", label: "Sao kê và giải trình chi" },
    { id: "content", label: "Nội dung" },
    { id: "cover-image", label: "Ảnh bìa" },
    { id: "pitch-video", label: "Video giới thiệu" },
    { id: "milestones", label: "Các mốc mục tiêu" },
    !isGive && { id: "reward-tiers", label: "Phần thưởng" },
    showMonthly && { id: "monthly", label: "Ủng hộ hằng tháng" },
    showUpdates && { id: "updates", label: "Cập nhật" },
    { id: "receiving-account", label: "Tài khoản nhận tiền" },
    { id: "status", label: "Trạng thái" },
  ].filter((item): item is { id: string; label: string } => Boolean(item))

  return (
    <MeDetail>
      {headerAndTabs}

      <div className="space-y-4">
        <StatusNotice
          status={campaign.status}
          reviewNote={campaign.review_note}
          accountBlock={openingBlock(accounts)}
          ended={campaign.ends_at !== null && new Date(campaign.ends_at) <= new Date()}
          paymentsStopped={Boolean(totals?.payments_stopped_at)}
        />
        {totals?.payments_stopped_at && (
          <Callout
            tone="warning"
            className="break-words"
            title={`Give đang tạm dừng yêu cầu thanh toán của dự án này từ ${formatDateTime(totals.payments_stopped_at)}.`}
          >
            {totals.payments_stopped_note && <p className="whitespace-pre-line">{totals.payments_stopped_note}</p>}
            <p>
              Người ủng hộ đang chờ thanh toán tạm thời không được nhắc chuyển tiền và trang thanh toán đang ẩn; trang
              dự án công khai thông báo này. Cần trao đổi, hãy liên hệ đội ngũ Give qua email <ContactEmailLink />.
            </p>
          </Callout>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:gap-x-6">
        {/* The editor is long: on wide screens a sticky list of its sections in the 4-column sidebar; phones scroll. */}
        <nav
          aria-label="Các mục của trình sửa"
          className="hidden min-w-0 lg:sticky lg:top-24 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:block lg:self-start"
        >
          <p className="px-3 text-sm font-semibold text-muted">Trên trang này</p>
          <ul className="mt-2 space-y-1">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="flex min-h-11 items-center rounded px-3 text-base text-fg transition-colors duration-150 hover:bg-surface focus-visible:-outline-offset-4"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-12 lg:col-span-8 lg:row-start-1">
          {showFulfillment && <FulfillmentLink campaignId={campaign.id} />}

          {showMoney && (
            <Panel
              id="money"
              title="Sao kê và giải trình chi"
              description={
                totals ? (
                  <p className={totals.unexplained_out_count > 0 ? "font-medium text-warning" : undefined}>
                    {totals.unexplained_out_count > 0
                      ? `${totals.unexplained_out_count} khoản chi chưa giải trình (công khai trên trang chiến dịch).`
                      : "Mọi khoản chi đã được giải trình."}
                  </p>
                ) : (
                  <p>Các khoản tiền ra từ tài khoản nhận của chiến dịch.</p>
                )
              }
            >
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/me/campaigns/${campaign.id}/unmatched`} variant="secondary">
                  Khớp tiền vào chưa có mã
                </ButtonLink>
                <ButtonLink
                  href={`/me/campaigns/${campaign.id}/disbursements`}
                  variant={totals && totals.unexplained_out_count > 0 ? "primary" : "secondary"}
                >
                  Giải trình khoản chi
                </ButtonLink>
              </div>
            </Panel>
          )}

          <Panel
            id="content"
            title="Nội dung"
            description={
              editable ? undefined : (
                <p className="text-muted">Nội dung chỉ sửa được khi chiến dịch là bản nháp hoặc cần chỉnh sửa.</p>
              )
            }
          >
            <ActionForm action={saveContent.bind(null, campaign.id)}>
              <fieldset disabled={!editable} className="max-w-160 space-y-8">
                <div className="space-y-6">
                  <div>
                    <label htmlFor="title" className="label">
                      Tiêu đề
                    </label>
                    <input
                      id="title"
                      name="title"
                      className="field"
                      defaultValue={campaign.title}
                      required
                      minLength={5}
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label htmlFor="category_id" className="label">
                      Danh mục
                    </label>
                    <select
                      id="category_id"
                      name="category_id"
                      className="field"
                      defaultValue={campaign.category_id ?? ""}
                    >
                      <option value="">Chọn danh mục</option>
                      {categoriesFor(categories, campaign.type).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.icon} {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="summary" className="label">
                      Tóm tắt
                    </label>
                    <textarea
                      id="summary"
                      name="summary"
                      className="field"
                      rows={2}
                      maxLength={200}
                      aria-describedby="summary_hint"
                      defaultValue={campaign.summary ?? ""}
                    />
                    <p id="summary_hint" className="hint">
                      Tối đa 200 ký tự, hiện ở đầu phần Câu chuyện trên trang chiến dịch.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="story" className="label">
                      Câu chuyện
                    </label>
                    <textarea
                      id="story"
                      name="story"
                      className="field font-mono leading-relaxed"
                      rows={12}
                      maxLength={50000}
                      aria-describedby="story_hint"
                      defaultValue={campaign.story ?? ""}
                    />
                    <p id="story_hint" className="hint">
                      Ít nhất 100 ký tự. Hỗ trợ Markdown (tiêu đề, danh sách, liên kết).
                    </p>
                  </div>
                </div>

                {isGive && (
                  <div className="space-y-4 border-t border-border pt-6">
                    <h3 className="text-h3">Người thụ hưởng</h3>
                    <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
                      <div>
                        <label htmlFor="beneficiary_name" className="label">
                          Người thụ hưởng
                        </label>
                        <input
                          id="beneficiary_name"
                          name="beneficiary_name"
                          className="field"
                          maxLength={120}
                          defaultValue={campaign.beneficiary_name ?? ""}
                        />
                      </div>
                      <div>
                        <label htmlFor="beneficiary_relation" className="label">
                          Quan hệ với bạn
                        </label>
                        <input
                          id="beneficiary_relation"
                          name="beneficiary_relation"
                          className="field"
                          maxLength={120}
                          placeholder="Ví dụ: bản thân, người thân, cộng đồng…"
                          defaultValue={campaign.beneficiary_relation ?? ""}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 border-t border-border pt-6">
                  <h3 className="text-h3">Mục tiêu và thời gian</h3>
                  <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
                    <div>
                      <label htmlFor="goal_amount" className="label">
                        Mục tiêu (₫)
                      </label>
                      <input
                        id="goal_amount"
                        name="goal_amount"
                        className="field tabular-nums"
                        inputMode="numeric"
                        required
                        defaultValue={String(campaign.goal_amount)}
                      />
                    </div>
                    <div>
                      <label htmlFor="min_contribution" className="label">
                        Góp tối thiểu (₫)
                      </label>
                      <input
                        id="min_contribution"
                        name="min_contribution"
                        className="field tabular-nums"
                        inputMode="numeric"
                        required
                        defaultValue={String(campaign.min_contribution)}
                      />
                    </div>
                    {!isGive && (
                      <>
                        <div>
                          <label htmlFor="stretch_goal_amount" className="label">
                            Mục tiêu mở rộng (₫, không bắt buộc)
                          </label>
                          <input
                            id="stretch_goal_amount"
                            name="stretch_goal_amount"
                            className="field tabular-nums"
                            inputMode="numeric"
                            defaultValue={campaign.stretch_goal_amount ? String(campaign.stretch_goal_amount) : ""}
                          />
                        </div>
                        <div>
                          <label htmlFor="payment_window_days" className="label">
                            Số ngày để người ủng hộ thanh toán
                          </label>
                          <input
                            id="payment_window_days"
                            name="payment_window_days"
                            type="number"
                            min={1}
                            max={30}
                            required
                            className="field tabular-nums"
                            defaultValue={campaign.payment_window_days}
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label htmlFor="starts_at" className="label">
                        Bắt đầu (giờ Việt Nam, không bắt buộc)
                      </label>
                      <input
                        id="starts_at"
                        name="starts_at"
                        type="datetime-local"
                        className="field"
                        aria-describedby="starts_at_hint"
                        defaultValue={toVietnamLocalInput(campaign.starts_at)}
                      />
                      <p id="starts_at_hint" className="hint">
                        Để trống thì mở ngay khi được duyệt.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="ends_at" className="label">
                        Kết thúc (giờ Việt Nam)
                      </label>
                      <input
                        id="ends_at"
                        name="ends_at"
                        type="datetime-local"
                        className="field"
                        aria-describedby={isGive ? undefined : "ends_at_hint"}
                        defaultValue={toVietnamLocalInput(campaign.ends_at)}
                      />
                      {!isGive && (
                        <p id="ends_at_hint" className="hint">
                          Dự án có quà tặng gây quỹ tối đa 60 ngày.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <fieldset className="border-t border-border pt-6">
                  <legend className="float-left w-full text-h3 text-fg">Hiển thị trên trang công khai</legend>
                  <div className="clear-left flex flex-wrap gap-x-8 pt-2">
                    <label className={checkLabelClass}>
                      <input
                        type="checkbox"
                        name="show_progress_bar"
                        className={checkInputClass}
                        defaultChecked={campaign.display_options.progress_bar !== false}
                      />
                      Thanh tiến độ
                    </label>
                    <label className={checkLabelClass}>
                      <input
                        type="checkbox"
                        name="show_backers_count"
                        className={checkInputClass}
                        defaultChecked={campaign.display_options.backers_count !== false}
                      />
                      Số người ủng hộ
                    </label>
                    <label className={checkLabelClass}>
                      <input
                        type="checkbox"
                        name="show_time_remaining"
                        className={checkInputClass}
                        defaultChecked={campaign.display_options.time_remaining !== false}
                      />
                      Thời gian còn lại
                    </label>
                  </div>
                </fieldset>

                {editable && (
                  <div className="border-t border-border pt-6">
                    <SubmitButton className={buttonClass()}>Lưu nội dung</SubmitButton>
                  </div>
                )}
              </fieldset>
            </ActionForm>
          </Panel>

          <Panel id="cover-image" title="Ảnh bìa">
            <div className="grid gap-6 sm:grid-cols-2">
              <figure className="min-w-0">
                <div className="relative aspect-[16/9] overflow-hidden rounded border border-border bg-surface">
                  {campaign.cover?.storage_path ? (
                    <Image
                      src={privateCoverUrl(campaign.cover.storage_path)}
                      unoptimized
                      alt={campaign.cover.alt ?? campaign.title}
                      fill
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <CoverPlaceholder type={campaign.type} />
                  )}
                </div>
                {!campaign.cover?.storage_path && (
                  <figcaption className="mt-2 text-sm text-muted">Chưa có ảnh bìa</figcaption>
                )}
              </figure>
              {editable && (
                <ActionForm action={uploadCover.bind(null, campaign.id)} resetOnSuccess className="min-w-0 space-y-6">
                  <div>
                    <label htmlFor="cover" className="label">
                      Chọn ảnh
                    </label>
                    <input
                      id="cover"
                      name="cover"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                      aria-describedby="cover_hint"
                      className={fileInputClass}
                    />
                    <p id="cover_hint" className="hint">
                      JPEG, PNG hoặc WebP, tối đa 4 MB. Nên dùng tỉ lệ 16:9.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="alt" className="label">
                      Mô tả ảnh (không bắt buộc)
                    </label>
                    <input id="alt" name="alt" className="field" maxLength={200} />
                  </div>
                  <SubmitButton className={buttonClass({ variant: "secondary" })}>Tải ảnh lên</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Panel>

          <Panel
            id="pitch-video"
            title="Video giới thiệu"
            description="Video YouTube hiện trên trang chiến dịch và chỉ tải từ YouTube khi người xem bấm phát."
          >
            {!youtubeState ? (
              <Callout tone="danger">Không tải được video giới thiệu. Hãy tải lại trang.</Callout>
            ) : (
              <div className="max-w-160 space-y-6">
                {youtubeVideo ? (
                  <div className="space-y-1">
                    <p className="text-fg">
                      Video hiện tại:{" "}
                      <a
                        href={`https://www.youtube.com/watch?v=${youtubeVideo.youtube_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link break-all"
                      >
                        https://www.youtube.com/watch?v={youtubeVideo.youtube_id}
                      </a>
                    </p>
                    {youtubeVideo.alt && <p className="text-sm break-words text-muted">Mô tả: {youtubeVideo.alt}</p>}
                  </div>
                ) : (
                  !editable && <p className="text-muted">Chiến dịch không có video giới thiệu.</p>
                )}

                {editable && (
                  <ActionForm action={saveYoutubeVideo.bind(null, campaign.id)} className="space-y-6">
                    <div
                      key={youtubeVideo ? `${youtubeVideo.youtube_id}:${youtubeVideo.alt ?? ""}` : "empty"}
                      className="space-y-6"
                    >
                      <Field
                        htmlFor="youtube_id"
                        label="Liên kết hoặc mã video YouTube"
                        hintId="youtube_id_hint"
                        hint="Dán liên kết YouTube (youtu.be, youtube.com/watch, shorts, embed) hoặc mã video 11 ký tự."
                      >
                        <input
                          id="youtube_id"
                          name="youtube_id"
                          className="field"
                          required
                          aria-describedby="youtube_id_hint"
                          placeholder="https://www.youtube.com/watch?v=..."
                          defaultValue={
                            youtubeVideo ? `https://www.youtube.com/watch?v=${youtubeVideo.youtube_id}` : ""
                          }
                        />
                      </Field>
                      <Field htmlFor="youtube_alt" label="Mô tả video (không bắt buộc)">
                        <input
                          id="youtube_alt"
                          name="alt"
                          className="field"
                          maxLength={200}
                          defaultValue={youtubeVideo?.alt ?? ""}
                        />
                      </Field>
                    </div>
                    <SubmitButton className={buttonClass({ variant: "secondary" })}>Lưu video</SubmitButton>
                  </ActionForm>
                )}

                {editable && youtubeVideo && (
                  <ActionForm
                    action={removeYoutubeVideo.bind(null, campaign.id)}
                    confirm="Gỡ video giới thiệu khỏi chiến dịch?"
                  >
                    <SubmitButton className={buttonClass({ variant: "danger" })}>Gỡ video</SubmitButton>
                  </ActionForm>
                )}
              </div>
            )}
          </Panel>

          <Panel
            id="milestones"
            title="Các mốc mục tiêu"
            description={milestones.length === 0 ? undefined : "Mốc giúp người ủng hộ thấy tiền sẽ làm được gì."}
          >
            {milestones.length > 0 ? (
              <ol className="divide-y divide-border rounded-md border border-border">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="min-w-0 space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="font-semibold break-words text-fg">{milestone.title}</p>
                        {milestone.description && (
                          <p className="mt-1 max-w-[68ch] break-words whitespace-pre-line text-fg">
                            {milestone.description}
                          </p>
                        )}
                        {milestone.unlock_note && (
                          <p className="mt-1 max-w-[68ch] text-sm break-words whitespace-pre-line text-muted">
                            <span className="font-medium text-fg">Khi đạt mốc:</span> {milestone.unlock_note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="figure">{formatVnd(milestone.target_amount)}</span>
                        {editable && (
                          <ActionForm
                            action={deleteMilestone.bind(null, campaign.id, milestone.id)}
                            confirm={`Xóa mốc “${milestone.title}”?`}
                          >
                            <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>
                              Xóa<span className="sr-only"> mốc {milestone.title}</span>
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </div>
                    {editable && (
                      <details className="group">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 link [&::-webkit-details-marker]:hidden">
                          Sửa mốc<span className="sr-only">: {milestone.title}</span>
                          <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
                        </summary>
                        <ActionForm
                          action={updateMilestone.bind(null, campaign.id, milestone.id)}
                          className="mt-3 max-w-160 space-y-6"
                        >
                          <MilestoneFields prefix={`milestone_${milestone.id}`} milestone={milestone} />
                          <SubmitButton className={buttonClass({ variant: "secondary" })}>
                            Lưu mốc<span className="sr-only">: {milestone.title}</span>
                          </SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted">Chưa có mốc nào. Mốc giúp người ủng hộ thấy tiền sẽ làm được gì.</p>
            )}
            {editable && (
              <ActionForm
                action={addMilestone.bind(null, campaign.id)}
                resetOnSuccess
                className="mt-6 max-w-160 space-y-6 border-t border-border pt-6"
              >
                <h3 className="text-h3">Thêm mốc</h3>
                <MilestoneFields prefix="milestone" milestone={null} />
                <SubmitButton className={buttonClass({ variant: "secondary" })}>Thêm mốc</SubmitButton>
              </ActionForm>
            )}
          </Panel>

          {!isGive && (
            <RewardTiersSection
              campaignId={campaign.id}
              status={campaign.status}
              minContribution={campaign.min_contribution}
              tiers={tiers}
            />
          )}

          {showMonthly && (
            <MonthlySection
              campaignId={campaign.id}
              status={campaign.status}
              endsAt={campaign.ends_at}
              allowMonthly={allowMonthly}
              supporters={planSupporters}
            />
          )}

          {showUpdates && (
            <Panel
              id="updates"
              title="Cập nhật cho người ủng hộ"
              description={
                !canUpdate
                  ? "Chiến dịch không còn nhận cập nhật mới."
                  : canPublish
                    ? "Lưu bản nháp để kiểm tra và sửa lại trước khi đăng. Cập nhật đã đăng công khai trên trang chiến dịch là hồ sơ vĩnh viễn, không thể sửa hay xóa."
                    : "Bạn có thể soạn sẵn bản nháp cập nhật; cập nhật chỉ đăng công khai được sau khi chiến dịch được duyệt và một khi đã đăng sẽ không thể sửa hay xóa."
              }
            >
              {canUpdate && (
                <ActionForm action={postUpdate.bind(null, campaign.id)} resetOnSuccess className="max-w-160 space-y-6">
                  <UpdateFields
                    prefix="update"
                    update={null}
                    bodyHint={
                      canPublish
                        ? "Bản nháp chỉ mình bạn thấy và có thể sửa hoặc xóa bất cứ lúc nào. Cập nhật đã đăng công khai không thể sửa hay xóa."
                        : "Bản nháp chỉ mình bạn thấy; sau khi chiến dịch được duyệt, bạn có thể đăng công khai."
                    }
                  />
                  <div className="flex flex-wrap gap-3">
                    <SubmitButton name="intent" value="draft" className={buttonClass({ variant: "secondary" })}>
                      Lưu bản nháp
                    </SubmitButton>
                    {canPublish && (
                      <SubmitButton name="intent" value="publish" className={buttonClass()}>
                        Đăng công khai
                      </SubmitButton>
                    )}
                  </div>
                </ActionForm>
              )}

              {updates.length > 0 && (
                <div className={canUpdate ? "mt-6 border-t border-border pt-6" : undefined}>
                  <h3 className="text-h3">Các cập nhật ({updates.length})</h3>
                  <ol className="mt-3 divide-y divide-border rounded-md border border-border">
                    {updates.map((update) => {
                      const isDraft = update.published_at === null
                      return (
                        <li key={update.id} className="min-w-0 space-y-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                            <div className="min-w-0 flex-1 basis-56">
                              <div className="flex flex-wrap items-center gap-2">
                                {isDraft ? (
                                  <Badge>Bản nháp</Badge>
                                ) : (
                                  <span className="text-sm text-muted tabular-nums">
                                    Đã đăng {formatDate(update.published_at)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 font-semibold break-words text-fg">{update.title}</p>
                              <p className="mt-1 max-w-[68ch] break-words whitespace-pre-line text-fg">{update.body}</p>
                            </div>
                            {isDraft && canUpdate && (
                              <div className="flex flex-wrap items-center gap-2">
                                {canPublish && (
                                  <ActionForm
                                    action={publishDraftUpdate.bind(null, campaign.id, update.id)}
                                    confirm={`Đăng công khai bản nháp “${update.title}”? Cập nhật đã đăng sẽ hiện công khai và không thể sửa hay xóa.`}
                                  >
                                    <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                                      Đăng công khai<span className="sr-only">: {update.title}</span>
                                    </SubmitButton>
                                  </ActionForm>
                                )}
                                <ActionForm
                                  action={deleteDraftUpdate.bind(null, campaign.id, update.id)}
                                  confirm={`Xóa bản nháp “${update.title}”?`}
                                >
                                  <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>
                                    Xóa bản nháp<span className="sr-only">: {update.title}</span>
                                  </SubmitButton>
                                </ActionForm>
                              </div>
                            )}
                          </div>
                          {isDraft && canUpdate && (
                            <details className="group">
                              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 link [&::-webkit-details-marker]:hidden">
                                Sửa bản nháp<span className="sr-only">: {update.title}</span>
                                <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
                              </summary>
                              <ActionForm
                                action={updateDraftUpdate.bind(null, campaign.id, update.id)}
                                className="mt-3 max-w-160 space-y-6"
                              >
                                <UpdateFields prefix={`update_${update.id}`} update={update} />
                                <SubmitButton
                                  name="intent"
                                  value="draft"
                                  className={buttonClass({ variant: "secondary" })}
                                >
                                  Lưu bản nháp<span className="sr-only">: {update.title}</span>
                                </SubmitButton>
                              </ActionForm>
                            </details>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
            </Panel>
          )}

          {!accounts && (
            <Panel id="receiving-account" title="Tài khoản nhận tiền">
              <Callout tone="danger">
                Không tải được tài khoản nhận tiền của chiến dịch. Hãy tải lại trang, hoặc xem tại trang{" "}
                <Link href="/me/accounts" className="font-medium underline">
                  Tài khoản nhận tiền
                </Link>
                .
              </Callout>
            </Panel>
          )}

          {accounts && (
            <ReceivingAccountSection
              campaignId={campaign.id}
              status={campaign.status}
              type={campaign.type}
              accounts={accounts}
            />
          )}

          <Panel id="status" title="Trạng thái">
            <div className="space-y-6">
              {statusEvents.length > 0 && (
                <div className="max-w-160">
                  <StatusHistory events={statusEvents} campaignTitle={campaign.title} />
                </div>
              )}
              {editable && (
                <ActionForm
                  action={submitForReview.bind(null, campaign.id)}
                  className={
                    statusEvents.length > 0 ? "max-w-160 space-y-4 border-t border-border pt-6" : "max-w-160 space-y-4"
                  }
                >
                  <p className="text-fg">
                    Khi gửi duyệt, bạn không sửa được nội dung cho tới khi kiểm duyệt viên trả lời. Cần có danh mục, tóm
                    tắt, câu chuyện ít nhất 100 ký tự, ngày kết thúc
                    {isGive ? " và người thụ hưởng" : ""}.
                  </p>
                  {submitBlocked && (
                    <Callout tone="warning" role="alert">
                      Chưa gửi duyệt được: chiến dịch cần gắn một tài khoản nhận tiền đã xác minh, đứng tên bạn.{" "}
                      {accounts?.bound &&
                      accounts.boundHasTransactions &&
                      !canAskSwap(campaign.status, campaign.type, accounts.boundHasTransactions) ? (
                        <>
                          Tài khoản đang gắn không còn dùng được và đã nhận giao dịch nên không nhả được: hãy liên hệ
                          đội ngũ Give qua email <ContactEmailLink /> để được hỗ trợ.
                        </>
                      ) : (
                        <>
                          {accounts?.bound
                            ? accounts.boundHasTransactions
                              ? "Tài khoản đang gắn không còn dùng được và đã nhận giao dịch nên không nhả được: gửi yêu cầu đổi tài khoản trong mục "
                              : "Tài khoản đang gắn không còn dùng được: nhả nó trong mục "
                            : "Chiến dịch này chưa gắn tài khoản: chọn tài khoản trong mục "}
                          <a href="#receiving-account" className="font-medium underline">
                            Tài khoản nhận tiền
                          </a>{" "}
                          {accounts?.bound
                            ? accounts.boundHasTransactions
                              ? "ở trên để bộ phận tài chính duyệt"
                              : "ở trên rồi gắn tài khoản khác"
                            : "ở trên"}
                          , hoặc khai báo và xác minh tài khoản tại trang{" "}
                          <Link href="/me/accounts" className="font-medium underline">
                            Tài khoản nhận tiền
                          </Link>
                          .
                        </>
                      )}
                    </Callout>
                  )}
                  <SubmitButton className={buttonClass({ size: "lg" })} disabled={Boolean(submitBlocked)}>
                    Gửi duyệt
                  </SubmitButton>
                </ActionForm>
              )}
              {organizerCanCancel(campaign.status) && (
                <ActionForm
                  action={cancelCampaign.bind(null, campaign.id)}
                  className={
                    editable || statusEvents.length > 0 ? "max-w-160 border-t border-border pt-6" : "max-w-160"
                  }
                  confirm="Hủy chiến dịch là vĩnh viễn. Tiếp tục?"
                >
                  <label htmlFor="cancel_reason" className="label">
                    Hủy chiến dịch
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      id="cancel_reason"
                      name="reason"
                      className="field sm:flex-1"
                      placeholder="Lý do (không bắt buộc)"
                      maxLength={500}
                    />
                    <SubmitButton className={buttonClass({ variant: "danger", className: "shrink-0" })}>
                      Hủy chiến dịch
                    </SubmitButton>
                  </div>
                </ActionForm>
              )}
              {campaign.status === "draft" && (
                <ActionForm action={deleteDraft.bind(null, campaign.id)} confirm="Xóa hẳn bản nháp này?">
                  <SubmitButton className={buttonClass({ variant: "danger" })}>Xóa bản nháp</SubmitButton>
                </ActionForm>
              )}
              {!editable && !organizerCanCancel(campaign.status) && statusEvents.length === 0 && (
                <p className="text-muted">Không có thao tác nào ở trạng thái này.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </MeDetail>
  )
}

const BIND_CONFIRM =
  "Gắn tài khoản này với chiến dịch? Sau khi gửi duyệt, tài khoản chỉ được nhả khi chiến dịch đã xong hẳn phần tiền, hoặc khi chiến dịch được yêu cầu chỉnh sửa mà tài khoản chưa nhận giao dịch nào."

/** One receiving account as a row: bank and number, holder name, and what sits on the right. */
function AccountRow({ account, aside }: { account: ReceivingAccount; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded bg-surface text-muted">
          <BankIcon />
        </span>
        <div className="min-w-0">
          {/* The owner's own page: the full number (RLS keeps other users out). */}
          <p className="font-semibold break-words text-fg">
            {bankLabel(account.bank_bin)} · <span className="tabular-nums">{account.account_number}</span>
          </p>
          <p className="break-words text-fg">{account.account_name}</p>
        </div>
      </div>
      {aside}
    </div>
  )
}

/**
 * The campaign's receiving account: the bound one with a release, or a picker
 * (DOS/Give#32; back campaigns too since DOS/Give#85).
 */
function ReceivingAccountSection({
  campaignId,
  status,
  type,
  accounts,
}: {
  campaignId: string
  status: CampaignStatus
  type: CampaignType
  accounts: EditorAccounts
}) {
  const { bound, boundUnusable, boundHasTransactions, choices, swaps } = accounts
  // A binding that recorded money is never released early; where eligible it is swapped instead (DOS/Give#55, #77).
  const releasable = canAskRelease(status, type) && !(isEditableStatus(status) && boundHasTransactions)
  return (
    <Panel
      id="receiving-account"
      title="Tài khoản nhận tiền"
      description={
        <p>
          {type === "give"
            ? "Người ủng hộ chuyển khoản thẳng vào tài khoản này qua mã VietQR."
            : "Khi dự án gây quỹ thành công, người ủng hộ thanh toán cam kết thẳng vào tài khoản này qua mã VietQR."}{" "}
          Chiến dịch cần gắn một tài khoản đã xác minh, đứng tên bạn, trước khi gửi duyệt. Khai báo và xác minh tài
          khoản tại trang{" "}
          <Link href="/me/accounts" className="link">
            Tài khoản nhận tiền
          </Link>
          .
        </p>
      }
    >
      {bound ? (
        <div className="space-y-4">
          <AccountRow account={bound} aside={<AccountStatusBadge status={bound.verification_status} />} />
          {boundUnusable && (
            <Callout tone="warning">
              Tài khoản đang gắn tạm không dùng được: {boundUnusable} Chiến dịch không nhận được tiền qua tài khoản này.
              {type === "back" && (status === "live" || status === "suspended") && (
                <>
                  {" "}
                  Dự án có quà tặng chưa đổi được tài khoản khi đang gây quỹ hoặc tạm dừng: hãy liên hệ đội ngũ Give qua
                  email <ContactEmailLink />.
                </>
              )}
            </Callout>
          )}
          {releasable ? (
            <ActionForm
              action={releaseAccount.bind(null, bound.id)}
              confirm={
                isBindableStatus(status)
                  ? "Nhả tài khoản này khỏi chiến dịch? Chiến dịch sẽ không có tài khoản nhận cho đến khi bạn gắn tài khoản khác."
                  : "Nhả tài khoản khỏi chiến dịch đã kết thúc để dùng cho chiến dịch khác? Hệ thống chỉ cho nhả khi phần tiền của chiến dịch đã xong hẳn."
              }
            >
              <SubmitButton className={buttonClass({ variant: "secondary" })}>Nhả tài khoản</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">
              <ContactText
                text={
                  boundHasTransactions && isEditableStatus(status)
                    ? canAskSwap(status, type, boundHasTransactions)
                      ? "Tài khoản đã nhận giao dịch nên là lịch sử tiền của chiến dịch và không nhả sớm được; nếu nó không dùng được nữa, hãy đề nghị đổi tài khoản bên dưới."
                      : `Tài khoản đã nhận giao dịch nên là lịch sử tiền của chiến dịch và không nhả sớm được; nếu nó không dùng được nữa, hãy liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL}.`
                    : "Khi chiến dịch đang chờ duyệt, đã duyệt hoặc đang chạy, tài khoản không nhả được; tài khoản được nhả khi chiến dịch đã xong hẳn phần tiền."
                }
              />
            </p>
          )}
          {canAskSwap(status, type, boundHasTransactions) && (
            <AccountSwapBlock campaignId={campaignId} choices={choices} swaps={swaps} />
          )}
        </div>
      ) : !canPickAccount(status, bound) ? (
        <p className="text-muted">Chiến dịch chưa gắn tài khoản nhận tiền.</p>
      ) : choices.length === 0 ? (
        <EmptyState
          title="Bạn chưa có tài khoản nhận tiền nào."
          action={<ButtonLink href="/me/accounts">Khai báo tài khoản</ButtonLink>}
        >
          Khai báo tài khoản rồi chuyển khoản xác minh; khi tài khoản đã được xác minh, quay lại đây để gắn.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {choices.map(({ account, blockedReason }) => (
            <li key={account.id} className="space-y-2 p-4">
              <AccountRow
                account={account}
                aside={
                  blockedReason ? (
                    <AccountStatusBadge status={account.verification_status} />
                  ) : (
                    <ActionForm action={bindAccount.bind(null, account.id)} confirm={BIND_CONFIRM}>
                      <input type="hidden" name="campaign_id" value={campaignId} />
                      <SubmitButton className={buttonClass({ variant: "secondary" })}>Gắn vào chiến dịch</SubmitButton>
                    </ActionForm>
                  )
                }
              />
              {blockedReason && <p className="text-warning sm:pl-13">{blockedReason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * The organizer's request to replace the bound account of a give campaign
 * that may hold money (DOS/Give#55): finance approves, and the old binding
 * ends and the new one starts at the same instant.
 */
function AccountSwapBlock({
  campaignId,
  choices,
  swaps,
}: {
  campaignId: string
  choices: AccountChoice[]
  swaps: AccountSwapRequest[]
}) {
  const pending = pendingSwap(swaps)
  const last = lastDecidedSwap(swaps)
  const usable = choices.filter((c) => !c.blockedReason).map((c) => c.account)
  const requested = pending ? choices.find((c) => c.account.id === pending.new_receiving_account_id)?.account : null

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <h3 className="text-h3">Đổi tài khoản nhận</h3>
      <p className="max-w-[68ch] text-fg">
        Nếu tài khoản đang gắn không dùng được nữa (ngân hàng đóng tài khoản, tài khoản bị khóa khi kiểm tra gian lận,
        tên chủ tài khoản không còn trùng tên pháp lý), bạn có thể đề nghị đổi sang một tài khoản khác đã xác minh, đứng
        tên bạn. Bộ phận tài chính của Give xem xét; khi được duyệt, tài khoản cũ ngừng nhận cho chiến dịch và bị khóa,
        tài khoản mới nhận tiền từ lúc đó. Tiền đã vào tài khoản cũ trước lúc đổi vẫn thuộc chiến dịch và vẫn có trong
        sao kê. Tiền chuyển ra khỏi tài khoản cũ sau lúc đổi (kể cả khi bạn chuyển số dư sang tài khoản mới) vẫn ghi vào
        sao kê là khoản chi của chiến dịch, và bạn cần giải trình như mọi khoản chi. Trang chiến dịch công khai ngày đổi
        tài khoản.
      </p>
      {last && last.status === "rejected" && !pending && (
        <Callout tone="warning" className="break-words">
          Yêu cầu gần nhất bị từ chối lúc {formatDateTime(last.decided_at)}
          {last.decision_note ? `: ${last.decision_note}` : "."}
        </Callout>
      )}
      {last && last.status === "approved" && !pending && (
        <Callout tone="success" className="break-words">
          Lần đổi tài khoản gần nhất được duyệt lúc {formatDateTime(last.decided_at)}
          {last.decision_note ? `: ${last.decision_note}` : "."}
        </Callout>
      )}
      {pending ? (
        <Callout tone="info">
          <div className="space-y-2">
            <p className="break-words">
              Đang chờ bộ phận tài chính duyệt yêu cầu gửi lúc {formatDateTime(pending.created_at)}: đổi sang{" "}
              {requested ? `${bankLabel(requested.bank_bin)} · ${requested.account_number}` : "tài khoản bạn đã chọn"}.
              Trong lúc chờ, chiến dịch vẫn dùng tài khoản đang gắn.
            </p>
            <p className="break-words whitespace-pre-line">Lý do: {pending.reason}</p>
            <ActionForm
              action={cancelAccountSwap.bind(null, pending.id, campaignId)}
              confirm="Rút yêu cầu đổi tài khoản này?"
            >
              <SubmitButton className={buttonClass({ variant: "secondary" })}>Rút yêu cầu</SubmitButton>
            </ActionForm>
          </div>
        </Callout>
      ) : usable.length === 0 ? (
        <p className="text-muted">
          Bạn chưa có tài khoản nào khác dùng được (đã xác minh, chưa gắn với chiến dịch nào). Khai báo và xác minh tài
          khoản mới tại trang{" "}
          <Link href="/me/accounts" className="link">
            Tài khoản nhận tiền
          </Link>
          , rồi quay lại đây.
        </p>
      ) : (
        <ActionForm
          action={requestAccountSwap.bind(null, campaignId)}
          confirm="Gửi yêu cầu đổi tài khoản nhận cho bộ phận tài chính?"
          className="max-w-160 space-y-6"
        >
          <div>
            <label htmlFor="swap_account" className="label">
              Tài khoản mới
            </label>
            <select id="swap_account" name="account_id" className="field" required>
              {usable.map((account) => (
                <option key={account.id} value={account.id}>
                  {bankLabel(account.bank_bin)} · {account.account_number} · {account.account_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="swap_reason" className="label">
              Vì sao tài khoản đang gắn không dùng được nữa
            </label>
            <textarea
              id="swap_reason"
              name="reason"
              className="field"
              rows={3}
              required
              maxLength={SWAP_REASON_MAX}
              placeholder="Ví dụ: ngân hàng đã đóng tài khoản ngày 01/11 sau khi kiểm tra. Bộ phận tài chính có thể liên hệ bạn để đối chiếu."
            />
          </div>
          <SubmitButton className={buttonClass()}>Gửi yêu cầu đổi tài khoản</SubmitButton>
        </ActionForm>
      )}
    </div>
  )
}

function MilestoneFields({ prefix, milestone }: { prefix: string; milestone: Milestone | null }) {
  const unlockHintId = `${prefix}_unlock_note_hint`
  const fieldKey = milestone
    ? `${milestone.title}:${milestone.target_amount}:${milestone.description ?? ""}:${milestone.unlock_note ?? ""}`
    : "new"
  return (
    <div key={fieldKey} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
        <Field htmlFor={`${prefix}_title`} label="Tên mốc">
          <input
            id={`${prefix}_title`}
            name="title"
            className="field"
            required
            minLength={2}
            maxLength={120}
            defaultValue={milestone?.title ?? ""}
          />
        </Field>
        <Field htmlFor={`${prefix}_target`} label="Số tiền (₫)">
          <input
            id={`${prefix}_target`}
            name="target_amount"
            className="field tabular-nums"
            inputMode="numeric"
            required
            defaultValue={milestone ? String(milestone.target_amount) : ""}
          />
        </Field>
      </div>
      <Field htmlFor={`${prefix}_description`} label="Mô tả (không bắt buộc)">
        <input
          id={`${prefix}_description`}
          name="description"
          className="field"
          maxLength={2000}
          defaultValue={milestone?.description ?? ""}
        />
      </Field>
      <Field
        htmlFor={`${prefix}_unlock_note`}
        label="Ghi chú khi đạt mốc (không bắt buộc)"
        hintId={unlockHintId}
        hint="Tối đa 500 ký tự, hiện công khai trên trang chiến dịch khi đạt mốc này."
      >
        <textarea
          id={`${prefix}_unlock_note`}
          name="unlock_note"
          className="field"
          rows={2}
          maxLength={500}
          aria-describedby={unlockHintId}
          defaultValue={milestone?.unlock_note ?? ""}
        />
      </Field>
    </div>
  )
}

function UpdateFields({
  prefix,
  update,
  bodyHint,
}: {
  prefix: string
  update: CampaignUpdate | null
  bodyHint?: string
}) {
  const bodyHintId = bodyHint ? `${prefix}_body_hint` : undefined
  const fieldKey = update ? `${update.title}:${update.body}` : "new"
  return (
    <div key={fieldKey} className="space-y-6">
      <Field htmlFor={`${prefix}_title`} label="Tiêu đề">
        <input
          id={`${prefix}_title`}
          name="title"
          className="field"
          required
          minLength={2}
          maxLength={200}
          defaultValue={update?.title ?? ""}
        />
      </Field>
      <Field htmlFor={`${prefix}_body`} label="Nội dung" hintId={bodyHintId} hint={bodyHint}>
        <textarea
          id={`${prefix}_body`}
          name="body"
          className="field"
          rows={5}
          required
          maxLength={50000}
          aria-describedby={bodyHintId}
          defaultValue={update?.body ?? ""}
        />
      </Field>
    </div>
  )
}

function StatusNotice({
  status,
  reviewNote,
  accountBlock,
  ended,
  paymentsStopped,
}: {
  status: CampaignStatus
  reviewNote: string | null
  /** Why the campaign has no usable receiving account (an approved one does not open), or null. */
  accountBlock: "no_account" | "unusable" | null
  ended: boolean
  paymentsStopped?: boolean
}) {
  const blockedApproval = !accountBlock
    ? null
    : ended
      ? "Đã duyệt, nhưng chiến dịch đã quá ngày kết thúc mà chưa mở được vì không có tài khoản nhận tiền dùng được. Kiểm duyệt viên có thể yêu cầu chỉnh sửa để bạn sửa ngày (và đổi tài khoản nếu được), hoặc bạn có thể hủy chiến dịch."
      : accountBlock === "no_account"
        ? `Đã duyệt, nhưng chiến dịch chưa mở được vì chưa gắn tài khoản nhận tiền. Gắn một tài khoản đã xác minh ở mục Tài khoản nhận tiền bên dưới; chiến dịch tự mở khi tới ngày bắt đầu. Nếu không gắn được, hãy liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL}.`
        : `Đã duyệt, nhưng chiến dịch chưa mở được vì tài khoản nhận tiền đang gắn không dùng được. Chiến dịch tự mở nếu tài khoản dùng được trở lại; nếu không, kiểm duyệt viên có thể yêu cầu chỉnh sửa để bạn đổi tài khoản. Cần hỗ trợ, hãy liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL}.`
  const notices: Record<CampaignStatus, { tone: CalloutTone; text: string }> = {
    draft: { tone: "neutral", text: "Bản nháp: chỉ bạn thấy. Hoàn thiện nội dung rồi gửi duyệt." },
    in_review: { tone: "warning", text: "Đang chờ kiểm duyệt. Nội dung tạm khóa." },
    changes_requested: {
      tone: "warning",
      text: `Kiểm duyệt viên yêu cầu chỉnh sửa${reviewNote ? `: ${reviewNote}` : "."} Sửa xong thì gửi duyệt lại.`,
    },
    approved: blockedApproval
      ? { tone: "warning", text: blockedApproval }
      : { tone: "info", text: "Đã duyệt. Chiến dịch tự mở khi tới ngày bắt đầu." },
    live: { tone: "success", text: "Chiến dịch đang công khai." },
    settling: {
      tone: "info",
      text: "Dự án đã hết thời gian nhận cam kết và đang tất toán kết quả.",
    },
    succeeded: {
      tone: "success",
      text: paymentsStopped
        ? "Dự án đã gây quỹ thành công. Bạn vẫn đăng cập nhật, giải trình chi và cập nhật giao quà cho người đã thanh toán được."
        : "Dự án đã gây quỹ thành công. Người ủng hộ đang thanh toán cam kết; bạn vẫn đăng cập nhật, giải trình chi và cập nhật giao quà được.",
    },
    failed: {
      tone: "neutral",
      text: "Dự án đã kết thúc mà chưa đạt mục tiêu. Các cam kết đã được hủy; người ủng hộ không phải thanh toán.",
    },
    closed: {
      tone: "neutral",
      text: "Chiến dịch đã kết thúc nhận ủng hộ. Sao kê vẫn công khai; bạn vẫn đăng cập nhật và giải trình chi được.",
    },
    suspended: {
      tone: "danger",
      text: `Chiến dịch đang tạm dừng${reviewNote ? `: ${reviewNote}` : "."}`,
    },
    cancelled: { tone: "neutral", text: "Chiến dịch đã hủy." },
  }
  const notice = notices[status]
  if (!notice) return null
  return (
    <Callout tone={notice.tone} className="break-words">
      <ContactText text={notice.text} />
    </Callout>
  )
}
