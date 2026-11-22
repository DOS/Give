import { ChevronDownIcon } from "@/components/ui/icons"
import { STATUS_LABELS, type CampaignStatus, type Db } from "@/lib/campaigns"
import { formatDateTime } from "@/lib/format"

// Never include actor_id so staff and organizer user UUIDs are never read or rendered.
const STATUS_EVENT_COLUMNS = "id, campaign_id, from_status, to_status, reason, created_at"
const STATUS_EVENTS_CHUNK_SIZE = 100

export interface CampaignStatusEvent {
  id: number | string
  campaign_id: string
  from_status: CampaignStatus | null
  to_status: CampaignStatus
  reason: string | null
  created_at: string
}

function statusLabel(status: CampaignStatus): string {
  return Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : status
}

export async function listStatusEventsByCampaign(
  db: Db,
  campaignIds: readonly string[]
): Promise<Map<string, CampaignStatusEvent[]>> {
  const unique = [...new Set(campaignIds.filter(Boolean))]
  const byCampaign = new Map<string, CampaignStatusEvent[]>()
  if (unique.length === 0) return byCampaign

  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += STATUS_EVENTS_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + STATUS_EVENTS_CHUNK_SIZE))
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      db
        .from("campaign_status_events")
        .select(STATUS_EVENT_COLUMNS)
        .in("campaign_id", chunk)
        .order("id", { ascending: false })
    )
  )

  for (const { data, error } of results) {
    if (error) throw error
    for (const row of (data ?? []) as unknown as CampaignStatusEvent[]) {
      const event: CampaignStatusEvent = {
        id: row.id,
        campaign_id: row.campaign_id,
        from_status: row.from_status,
        to_status: row.to_status,
        reason: row.reason,
        created_at: row.created_at,
      }
      const list = byCampaign.get(row.campaign_id)
      if (list) list.push(event)
      else byCampaign.set(row.campaign_id, [event])
    }
  }

  return byCampaign
}

export function StatusHistory({
  events,
  campaignTitle,
}: {
  events: readonly CampaignStatusEvent[]
  campaignTitle: string
}) {
  if (events.length === 0) return null

  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="tabular-nums">
          Lịch sử trạng thái ({events.length})<span className="sr-only">: {campaignTitle}</span>
        </span>
        <ChevronDownIcon width={20} height={20} className="shrink-0 group-open:rotate-180" />
      </summary>
      <ol className="mt-2 divide-y divide-border border-t border-border">
        {events.map((event) => {
          const reason = event.reason?.trim() || null
          const transition = event.from_status
            ? `${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}`
            : statusLabel(event.to_status)
          return (
            <li key={String(event.id)} className="space-y-1 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-fg">{transition}</span>
                <time dateTime={event.created_at} className="text-muted tabular-nums">
                  {formatDateTime(event.created_at)}
                </time>
              </div>
              {reason && <p className="max-w-[68ch] break-words whitespace-pre-line text-fg">{reason}</p>}
            </li>
          )
        })}
      </ol>
    </details>
  )
}
