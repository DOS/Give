import type { ReactNode } from "react"

/**
 * A labelled form field: the label above, the control, then a hint. Pass
 * the control as children with the same `id` as `htmlFor`, styled with the
 * `field` utility. To associate a hint, pass `hintId` and include it in the
 * control’s `aria-describedby` alongside any existing description ids.
 */
export function Field({
  htmlFor,
  label,
  hint,
  hintId,
  children,
}: {
  htmlFor: string
  label: ReactNode
  hint?: ReactNode
  hintId?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
    </div>
  )
}
