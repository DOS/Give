import clsx from "clsx"

import { formatVnd } from "@/lib/format"

export interface SummaryCell {
  label: string
  amount: number
  /** data-figure hook the tests and acceptance scripts read. */
  figure?: string
  tone?: "default" | "primary" | "accent"
}

/**
 * The statement summary (DESIGN.md 8, campaign page): four figures in one
 * bordered strip, two per row on phones. The last figure is the one the
 * visitor came for (what remains, or what is still missing).
 */
export function SummaryCells({ cells, label }: { cells: readonly SummaryCell[]; label: string }) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 bg-raised p-3 sm:p-4">
          <dt className="text-sm text-muted">{cell.label}</dt>
          <dd
            className={clsx(
              "mt-1 text-base font-bold break-words tabular-nums sm:text-lg",
              cell.tone === "primary" ? "text-primary" : cell.tone === "accent" ? "text-accent" : "text-fg"
            )}
            data-figure={cell.figure}
          >
            {formatVnd(cell.amount)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
