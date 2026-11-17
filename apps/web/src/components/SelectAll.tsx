"use client"

/** A checkbox that ticks or clears every checkbox named `name` in its form; sized for touch like the /me checkboxes. */
export function SelectAll({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-base text-fg">
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-primary"
        onChange={(event) => {
          const form = event.currentTarget.form
          if (!form) return
          for (const box of form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)) {
            box.checked = event.currentTarget.checked
          }
        }}
      />
      {label}
    </label>
  )
}
