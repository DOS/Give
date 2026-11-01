"use client"

import Link from "next/link"
import { startTransition, useActionState, useState } from "react"

import type { UploadResult } from "./actions"

export interface UploadChoice {
  id: string
  label: string
  /** Formats of the account's bank; empty until that bank's parser exists. */
  parsers: { name: string; label: string }[]
}

/**
 * Account and format pickers plus the file input. Only formats of the chosen
 * account's bank are offered; with none, the form says so instead of letting
 * the person upload a file nobody can read.
 */
export function UploadForm({
  action,
  accounts,
}: {
  action: (state: UploadResult, form: FormData) => Promise<UploadResult>
  accounts: UploadChoice[]
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const parsers = accounts.find((a) => a.id === accountId)?.parsers ?? []

  return (
    <form
      action={formAction}
      className="space-y-4 card p-6"
      onSubmit={(event) => {
        // Keeps the chosen file and pickers when the server refuses the upload (see ActionForm).
        event.preventDefault()
        if (pending) return
        const data = new FormData(event.currentTarget)
        startTransition(() => formAction(data))
      }}
    >
      <div>
        <label htmlFor="account_id" className="label">
          Tài khoản nhận
        </label>
        <select
          id="account_id"
          name="account_id"
          className="field"
          required
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      </div>

      {parsers.length === 0 ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Định dạng sao kê của ngân hàng này chưa được hỗ trợ. Give đang bổ sung từng ngân hàng; khi định dạng của ngân
          hàng bạn sẵn sàng, bạn có thể tải sao kê lên ở đây.
        </p>
      ) : (
        <>
          <div>
            <label htmlFor="parser" className="label">
              Định dạng sao kê
            </label>
            <select id="parser" name="parser" className="field" required key={accountId}>
              {parsers.map((parser) => (
                <option key={parser.name} value={parser.name}>
                  {parser.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="file" className="label">
              File sao kê
            </label>
            <input id="file" name="file" type="file" className="field" required />
            <p className="hint">
              File xuất nguyên bản từ ngân hàng, tối đa 4 MB và 5.000 dòng. Tải lại cùng một file không ghi trùng.
            </p>
          </div>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Đang xử lý…" : "Tải lên và nhập"}
          </button>
        </>
      )}

      {state?.message && (
        <div role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-700" : "text-red-700"}`}>
          <p>{state.message}</p>
          {state.batchId && (
            <Link href={`/me/statements/${state.batchId}`} className="mt-1 inline-block font-medium text-brand-600">
              Xem từng dòng của sao kê →
            </Link>
          )}
        </div>
      )}
    </form>
  )
}
