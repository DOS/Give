import clsx from "clsx"
import type { AriaRole, ReactNode } from "react"

export type CalloutTone = "neutral" | "info" | "success" | "warning" | "danger"

const TONES: Record<CalloutTone, string> = {
  neutral: "border-line bg-surface text-body",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-brand-200 bg-brand-50 text-brand-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
}

/**
 * A tinted notice box for a status, a warning or a failed read: hairline
 * border, 6px radius, text in the tone's dark shade (4.5:1 on its tint).
 * Pass `role="alert"` only for something the person must act on now.
 */
export function Callout({
  tone = "neutral",
  title,
  role,
  id,
  className,
  children,
}: {
  tone?: CalloutTone
  title?: ReactNode
  role?: AriaRole
  id?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div id={id} role={role} className={clsx("rounded-md border px-4 py-3 text-base", TONES[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && "mt-1")}>{children}</div>}
    </div>
  )
}
