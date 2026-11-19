import { Badge } from "@/components/ui/Badge"
import type { Milestone } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"

/**
 * Campaign milestones on `/campaigns/[slug]` (DOS/Give#268).
 *
 * Milestone completion is derived from public money totals (`raisedAmount`),
 * never stored as a mutable boolean flag. On organizer/moderator previews
 * (`raisedAmount === null`), milestones are not marked reached and non-empty
 * `unlock_note` text is shown with a `"Khi đạt mốc:"` prefix for verification.
 */
export function MilestoneList({
  milestones,
  raisedAmount,
  preview = raisedAmount === null,
}: {
  milestones: readonly Milestone[]
  raisedAmount: number | null
  preview?: boolean
}) {
  if (milestones.length === 0) return null

  return (
    <ol className="mt-6">
      {milestones.map((milestone) => {
        const reached = raisedAmount !== null && raisedAmount >= milestone.target_amount
        const description = milestone.description?.trim() || null
        const unlockNote = milestone.unlock_note?.trim() || null

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
          </li>
        )
      })}
    </ol>
  )
}
