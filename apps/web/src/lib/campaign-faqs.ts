import type { CampaignMemberRole } from "./campaign-members"
import type { CampaignStatus, Db } from "./campaigns"

export const MAX_CAMPAIGN_FAQS = 25
export const FAQ_QUESTION_MAX = 300
export const FAQ_ANSWER_MAX = 4000

/**
 * Campaign statuses where owners and accepted co-organizer editors may create,
 * edit, delete, or reorder FAQs (DOS/Give#316). Matches give.is_faq_editable_status.
 */
export const FAQ_EDITABLE_STATUSES: readonly CampaignStatus[] = ["draft", "changes_requested", "approved", "live"]

export interface CampaignFaq {
  id: string
  campaign_id: string
  question: string
  answer: string
  position: number
  created_at: string
  updated_at: string
}

export function canEditFaqs(status: CampaignStatus): boolean {
  return FAQ_EDITABLE_STATUSES.includes(status)
}

/**
 * Only the owning organizer may duplicate a campaign into a fresh draft, and
 * suspended campaigns are blocked by give.duplicate_campaign_draft (DOS/Give#316).
 */
export function canDuplicateCampaign(role: CampaignMemberRole, status: CampaignStatus): boolean {
  return role === "owner" && status !== "suspended"
}

export function sortFaqs(faqs: readonly CampaignFaq[]): CampaignFaq[] {
  return [...faqs].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/** Moves one FAQ id a single step up or down; returns null when already at the edge or missing. */
export function moveFaqOrder(ids: readonly string[], faqId: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(faqId)
  if (index === -1) return null
  const target = direction === "up" ? index - 1 : index + 1
  if (target < 0 || target >= ids.length) return null
  const next = [...ids]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/**
 * Loads a campaign's ordered FAQs under the caller's RLS scope (public/pre-launch
 * campaigns for anon & outsiders; all managed campaigns for owner, accepted
 * co-organizer editor, and staff).
 */
export async function listCampaignFaqs(db: Db, campaignId: string): Promise<CampaignFaq[]> {
  const { data, error } = await db
    .from("campaign_faqs")
    .select("id, campaign_id, question, answer, position, created_at, updated_at")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true })
    .order("id", { ascending: true })
  if (error) throw error
  return (data ?? []) as CampaignFaq[]
}
