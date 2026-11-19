import "server-only"

import { NextResponse } from "next/server"

import { dbService } from "@/lib/supabase"

/** Calls stop starting after this long, well inside the route's maxDuration. */
export const PURGE_BUDGET_MS = 45_000

interface PurgeCounts {
  deleted_accounts: number
  cleared: number
  expired_tokens: number
}

function purgeAnswer(data: unknown): (PurgeCounts & { more: boolean }) | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null
  const { deleted_accounts, cleared, expired_tokens, more } = data as Record<string, unknown>
  return typeof deleted_accounts === "number" &&
    typeof cleared === "number" &&
    typeof expired_tokens === "number" &&
    typeof more === "boolean"
    ? { deleted_accounts, cleared, expired_tokens, more }
    : null
}

/** One purge-outbox run: calls give.purge_outbox while it says there is more, within PURGE_BUDGET_MS. */
export async function purgeUntilDone(now: () => number): Promise<NextResponse> {
  const started = now()
  const total: PurgeCounts & { calls: number; more: boolean } = {
    deleted_accounts: 0,
    cleared: 0,
    expired_tokens: 0,
    calls: 0,
    more: true,
  }
  while (total.more && now() - started < PURGE_BUDGET_MS) {
    const { data, error } = await dbService().rpc("purge_outbox")
    total.calls += 1
    if (error) {
      console.error("purge_outbox failed", error.code, error.message)
      return NextResponse.json({ error: "purge_failed", ...total }, { status: 500 })
    }
    const answer = purgeAnswer(data)
    if (!answer) {
      console.error("purge_outbox answered unexpectedly")
      return NextResponse.json({ error: "purge_failed", ...total }, { status: 500 })
    }
    total.deleted_accounts += answer.deleted_accounts
    total.cleared += answer.cleared
    total.expired_tokens += answer.expired_tokens
    total.more = answer.more
  }
  return NextResponse.json(total)
}
