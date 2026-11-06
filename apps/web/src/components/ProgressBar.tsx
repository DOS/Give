import clsx from "clsx"

/**
 * Funding progress: a primary bar on a border-colored track, 4px radius. `label`
 * names it for screen readers (the visible figures sit next to it).
 */
export function ProgressBar({
  percent,
  className,
  label = "Tiến độ gây quỹ",
  size = "md",
}: {
  percent: number
  className?: string
  label?: string
  /** sm is 6px (cards), md is 8px (funding box, receipt). */
  size?: "sm" | "md"
}) {
  const value = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={clsx("w-full overflow-hidden rounded bg-border", size === "sm" ? "h-1.5" : "h-2", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
    >
      <div className="h-full rounded bg-primary" style={{ width: `${value}%` }} />
    </div>
  )
}
