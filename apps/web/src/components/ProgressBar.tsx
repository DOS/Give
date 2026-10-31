export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const value = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-gray-100 ${className ?? ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />
    </div>
  )
}
