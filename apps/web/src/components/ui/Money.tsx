import clsx from "clsx"

import { formatVnd } from "@/lib/format"

/** A money amount in đồng, tabular so figures line up. */
export function Money({
  amount,
  size = "md",
  className,
  figure,
}: {
  amount: number
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  /** data-figure hook the acceptance scripts read. */
  figure?: string
}) {
  return (
    <span
      className={clsx(
        "figure",
        size === "sm" && "text-base",
        size === "md" && "text-lg",
        size === "lg" && "text-2xl",
        size === "xl" && "text-3xl tracking-tight sm:text-4xl",
        className
      )}
      data-figure={figure}
    >
      {formatVnd(amount)}
    </span>
  )
}

/**
 * One line of a money breakdown, receipt style: the label on the left, a
 * dotted leader, the amount on the right. Renders a <div> of <dt>/<dd>, so
 * put it inside a <dl>.
 */
export function MoneyRow({
  label,
  amount,
  figure,
  note,
  tone = "default",
  strong,
}: {
  label: string
  amount: number
  figure?: string
  note?: string
  tone?: "default" | "warn" | "muted"
  strong?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 py-1.5">
      <dt
        className={clsx(
          // Grows but never shrinks: a long label pushes the amount to its own line instead of wrapping.
          "flex flex-[1_0_auto] items-baseline gap-2 after:min-w-4 after:flex-1 after:translate-y-[-0.25em] after:border-b after:border-dotted after:border-gray-300 after:content-['']",
          strong ? "font-semibold text-ink" : "text-body"
        )}
      >
        {label}
      </dt>
      <dd
        className={clsx(
          // One colour class only: Tailwind's order, not this list's, decides which of two wins.
          "ml-auto shrink-0 tabular-nums",
          strong ? "text-lg font-bold" : "font-semibold",
          tone === "warn" ? "text-amber-800" : tone === "muted" ? "text-muted" : "text-ink"
        )}
        data-figure={figure}
      >
        {formatVnd(amount)}
      </dd>
      {note && (
        <dd className={clsx("basis-full text-right text-sm", tone === "warn" ? "text-amber-800" : "text-muted")}>
          {note}
        </dd>
      )}
    </div>
  )
}
