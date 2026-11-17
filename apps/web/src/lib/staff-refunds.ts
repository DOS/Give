import type { CampaignStatus, Db } from "@/lib/campaigns"

/**
 * Finance's way to explain a campaign's transfer out as a refund
 * (DOS/Give#203). Since DOS/Give#199 nobody books a refund to their own
 * contribution (give.record_disbursement raises GIVE_SELF_REVIEW), so when
 * an organizer gave to their own campaign and was refunded, finance or admin
 * staff record that refund (give.actor_manages_campaign admits them for any
 * campaign). Everything here is read with the staff member's own token: under
 * RLS finance and admin staff read every campaign's transactions.
 */

/** A campaign with transfers out that still wait for an explanation. */
export interface CampaignWithUnexplainedOutgoing {
  campaign_id: string
  title: string | null
  status: CampaignStatus | null
  /** Transfers out still to explain (not returned by the bank, not a move between own accounts). */
  count: number
  amount: number
  oldest_booked_at: string
}

/** Transfers out read for the list; the oldest ones first, so none hides behind the limit for long. */
export const UNEXPLAINED_SCAN_LIMIT = 1000

type Row = {
  campaign_id: string
  amount: unknown
  booked_at: string
  returned?: unknown
}

function linked(embed: unknown): boolean {
  return Array.isArray(embed) ? embed.length > 0 : embed != null
}

/**
 * Campaigns with transfers out still to explain, the longest waiting first.
 * The same rules as the organizer's list (listUnexplainedOutgoing): a
 * transfer already explained, paired as a move to the campaign's new account
 * (DOS/Give#84) or returned by the bank (DOS/Give#194) is not counted.
 * `truncated` is true when more transfers wait than were read.
 */
export async function listCampaignsWithUnexplainedOutgoing(
  db: Db,
  limit = UNEXPLAINED_SCAN_LIMIT
): Promise<{ campaigns: CampaignWithUnexplainedOutgoing[]; truncated: boolean }> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(
      "campaign_id, amount, booked_at, disbursements(bank_transaction_id), own_out:own_account_transfers!out_transaction_id(id), returned:returned_transfers!original_transaction_id(linked_at)"
    )
    .eq("direction", "out")
    .not("campaign_id", "is", null)
    .is("disbursements", null)
    .is("own_out", null)
    .order("booked_at", { ascending: true })
    .limit(limit)
  if (error) throw error
  const rows = (data ?? []) as unknown as Row[]

  const byCampaign = new Map<string, CampaignWithUnexplainedOutgoing>()
  for (const row of rows) {
    if (linked(row.returned)) continue
    const entry = byCampaign.get(row.campaign_id) ?? {
      campaign_id: row.campaign_id,
      title: null,
      status: null,
      count: 0,
      amount: 0,
      oldest_booked_at: row.booked_at,
    }
    entry.count += 1
    entry.amount += Number(row.amount)
    byCampaign.set(row.campaign_id, entry)
  }

  const ids = [...byCampaign.keys()]
  if (ids.length > 0) {
    const { data: campaigns, error: campaignsError } = await db
      .rpc("managed_campaigns", {})
      .select("id, title, status")
      .in("id", ids)
    if (campaignsError) throw campaignsError
    for (const c of (campaigns ?? []) as { id: string; title: string; status: CampaignStatus }[]) {
      const entry = byCampaign.get(c.id)
      if (entry) Object.assign(entry, { title: c.title, status: c.status })
    }
  }

  return {
    // Rows come oldest first, so the map is already in waiting order.
    campaigns: [...byCampaign.values()],
    truncated: rows.length >= limit,
  }
}
