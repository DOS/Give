"use client"

/** A checkbox that ticks or clears every checkbox named `name` in its form. */
export function SelectAll({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
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
