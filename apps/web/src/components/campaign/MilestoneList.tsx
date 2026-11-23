import Link from "next/link"

import { Badge } from "@/components/ui/Badge"
import type { Milestone } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"
import type { MilestoneRollup } from "@/lib/transparency"

/**
 * Campaign milestones & Milestone Evidence Timeline on `/campaigns/[slug]`
 * (DOS/Give#268, #314).
 *
 * Milestone completion is derived from public money totals (`raisedAmount`),
 * never stored as a mutable boolean flag. When `rollups` from
 * `give.campaign_transparency_summary` are provided on a public campaign, each
 * milestone also displays its linked disbursement total, disbursement count,
 * and public evidence count. On organizer/moderator previews
 * (`raisedAmount === null`), milestones are not marked reached and non-empty
 * `unlock_note` text is shown with a `"Khi đạt mốc:"` prefix for verification.
 */
export function MilestoneList({
  milestones,
  raisedAmount,
  preview = raisedAmount === null,
  rollups,
  statementUrl,
}: {
  milestones: readonly Milestone[]
  raisedAmount: number | null
  preview?: boolean
  rollups?: readonly MilestoneRollup[]
  statementUrl?: string
}) {
  if (milestones.length === 0) return null

  const rollupById = rollups ? new Map(rollups.map((r) => [r.milestone_id, r])) : null

  return (
    <ol className="mt-6">
      {milestones.map((milestone) => {
        const reached = raisedAmount !== null && raisedAmount >= milestone.target_amount
        const description = milestone.description?.trim() || null
        const unlockNote = milestone.unlock_note?.trim() || null
        const rollup = !preview && rollupById ? rollupById.get(milestone.id) : undefined

        return (
          <li key={milestone.id} className="border-b border-border py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="font-semibold break-words">{milestone.title}</h3>
                {reached && <Badge tone="brand">Đã đạt mốc</Badge>}
              </div>
              <span className="font-semibold tabular-nums">{formatVnd(milestone.target_amount)}</span>
            </div>
            {description && <p className="mt-1 break-words whitespace-pre-line text-muted">{description}</p>}
            {reached && unlockNote && (
              <p className="mt-2 text-sm break-words whitespace-pre-line text-fg">{unlockNote}</p>
            )}
            {!reached && preview && unlockNote && (
              <p className="mt-2 text-sm break-words whitespace-pre-line text-muted">
                <span className="font-medium text-fg">Khi đạt mốc:</span> {unlockNote}
              </p>
            )}
            {rollup && (
              <div
                data-milestone-evidence={milestone.id}
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-surface px-3 py-2 text-sm text-muted"
              >
                {rollup.disbursement_count > 0 ? (
                  <>
                    <span className="font-semibold text-fg tabular-nums">
                      Đã giải ngân {formatVnd(rollup.disbursed_total)}
                    </span>
                    <span className="tabular-nums">{rollup.disbursement_count} khoản chi</span>
                    <span className="tabular-nums">{rollup.evidence_count} chứng từ công khai</span>
                    {statementUrl && (
                      <Link href={statementUrl} className="font-medium text-primary hover:underline">
                        Xem sao kê →
                      </Link>
                    )}
                  </>
                ) : (
                  <span>Chưa có khoản chi gắn mốc này</span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
