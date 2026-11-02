"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { getParkedInbound, MAX_DISMISS_NOTE_LENGTH, statementEventRef, type ParkedInboundEvent } from "@/lib/inbound"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Finance/admin staff act on a parked inbound event (DOS/Give#73): send it
 * back to the reprocess cron (give.retry_inbound_event) or end it with a note
 * (give.dismiss_inbound_event). Both run as the service role with the actor's
 * id as an argument, and check the role and the event under their locks.
 * Because they trust the id, the staff role and the parked event are first
 * read with the actor's own token: PostgREST verifies that token, so a forged
 * session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_ALLOWED = "Chỉ nhân viên tài chính hoặc quản trị viên mới xử lý được sự kiện bị dừng."
const NOT_PARKED =
  "Sự kiện này không còn chờ nhân viên xử lý: có người đã gửi lại hoặc bỏ qua, hoặc một lần tải lại file đã xử lý xong. Hãy tải lại trang."
const NOTE_REQUIRED = "Ghi lý do bỏ qua sự kiện này."
const NOTE_TOO_LONG = `Ghi chú tối đa ${MAX_DISMISS_NOTE_LENGTH} ký tự.`

const MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: NOT_ALLOWED,
  GIVE_INBOUND_EVENT_NOT_PARKED: NOT_PARKED,
  GIVE_INBOUND_EVENT_NOT_FOUND: NOT_PARKED,
  GIVE_DISMISS_NOTE_REQUIRED: NOTE_REQUIRED,
}

type Checked = { actorId: string; event: ParkedInboundEvent; db: ReturnType<typeof dbAs> }

/** The signed-in finance/admin actor and the parked event, or why not. */
async function checkParked(eventId: string): Promise<Checked | { failure: ActionResult }> {
  const session = await getSession()
  if (!session) return { failure: fail(SIGNED_OUT) }
  if (!isUuid(eventId)) return { failure: fail(NOT_PARKED) }
  const db = dbAs(session.accessToken)
  let event
  try {
    if (!(await isStaff(db, FINANCE_ROLES))) return { failure: fail(NOT_ALLOWED) }
    event = await getParkedInbound(db, eventId)
    if (!event) return { failure: fail(NOT_PARKED) }
  } catch (error) {
    return { failure: fail(dbErrorMessage(error as DbErrorLike)) }
  }
  return { actorId: session.user.id, event, db }
}

/**
 * Later parts of the same statement file that were parked while waiting for
 * this one (STATEMENT_PART_WAITING): they spent their attempts waiting, so
 * they are sent back with it. Read with the actor's token, like the event.
 */
async function waitingLaterParts({ event, db }: Checked): Promise<string[]> {
  const ref = statementEventRef(event.dedupe_key)
  if (!ref?.part) return []
  const fileKey = event.dedupe_key.slice(0, event.dedupe_key.indexOf(":part"))
  const { data, error } = await db
    .from("parked_inbound_events")
    .select("id, dedupe_key")
    .eq("channel", "statement_import")
    .eq("last_error", "STATEMENT_PART_WAITING")
    .like("dedupe_key", `${fileKey}:part%`)
  if (error || !Array.isArray(data)) return []
  return (data as { id: string; dedupe_key: string }[])
    .filter((e) => (statementEventRef(e.dedupe_key)?.part?.number ?? 0) > ref.part!.number)
    .map((e) => e.id)
}

export async function retryInboundEvent(eventId: string, _state: ActionResult, _form: FormData): Promise<ActionResult> {
  const checked = await checkParked(eventId)
  if ("failure" in checked) return checked.failure
  const { error } = await dbService().rpc("retry_inbound_event", {
    p_inbound_event_id: eventId,
    p_actor_id: checked.actorId,
  })
  if (error) return fail(dbErrorMessage(error, MESSAGES))
  let alsoSent = 0
  for (const id of await waitingLaterParts(checked)) {
    // One that changed meanwhile is refused by the database and left as it is.
    const later = await dbService().rpc("retry_inbound_event", { p_inbound_event_id: id, p_actor_id: checked.actorId })
    if (!later.error) alsoSent += 1
  }
  revalidatePath("/admin/inbound")
  return done(
    `Đã gửi lại sự kiện${alsoSent > 0 ? ` cùng ${alsoSent} phần sau của cùng file đang chờ nó` : ""}. Give sẽ tự xử lý lại trong lần chạy tới (vài phút một lần), với lượt thử mới từ đầu.`
  )
}

export async function dismissInboundEvent(
  eventId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  // Browsers submit line breaks as CRLF; count and store them as one character.
  const note = String(form.get("note") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  if (!note) return fail(NOTE_REQUIRED)
  // Counted in characters (code points), as the database's left() does.
  if ([...note].length > MAX_DISMISS_NOTE_LENGTH) return fail(NOTE_TOO_LONG)
  const checked = await checkParked(eventId)
  if ("failure" in checked) return checked.failure
  const { error } = await dbService().rpc("dismiss_inbound_event", {
    p_inbound_event_id: eventId,
    p_actor_id: checked.actorId,
    p_note: note,
  })
  if (error) return fail(dbErrorMessage(error, MESSAGES))
  revalidatePath("/admin/inbound")
  return done("Đã bỏ qua sự kiện. Give sẽ không xử lý nó nữa; lý do được ghi vào nhật ký kiểm toán.")
}
