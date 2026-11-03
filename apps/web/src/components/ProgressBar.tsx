import clsx from "clsx"

/**
 * Funding progress: a green bar on a light track, low radius. `label` names
 * it for screen readers (the visible figures sit next to it).
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
  size?: "sm" | "md"
}) {
  const value = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={clsx("w-full overflow-hidden rounded-sm bg-gray-200", size === "sm" ? "h-1.5" : "h-2", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
    >
      <div className="h-full rounded-sm bg-brand-600" style={{ width: `${value}%` }} />
    </div>
  )
}
