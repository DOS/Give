import type { ReactNode } from "react"

/**
 * A labelled form field: the label above, the control, then a hint. Pass
 * the control as children with the same `id` as `htmlFor`, styled with the
 * `field` utility.
 */
export function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}
