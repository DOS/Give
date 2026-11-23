"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth/session"
import { getCampaignTemplate } from "@/lib/campaign-templates"
import { categoriesFor, fundingModelFor, getOrganizer, listCategories } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { uniqueSlug } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields, newCampaignSchema, organizerSchema } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

/** Creates or updates the signed-in user's organizer profile. */
export async function saveOrganizer(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const parsed = organizerSchema.safeParse(formFields(form, ["kind", "legal_name", "display_name", "phone"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const db = dbAs(session.accessToken)
  let existing
  try {
    existing = await getOrganizer(db, session.user.id)
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string }))
  }
  // Column grants allow user_id on insert only, so this is not an upsert.
  let { error } = existing
    ? await db.from("organizers").update(parsed.data).eq("user_id", session.user.id)
    : await db.from("organizers").insert({ user_id: session.user.id, ...parsed.data })
  if (!existing && error?.code === "23505") {
    ;({ error } = await db.from("organizers").update(parsed.data).eq("user_id", session.user.id))
  }
  if (error) return fail(dbErrorMessage(error))

  revalidatePath("/start")
  revalidatePath("/me")
  revalidatePath("/")
  revalidatePath("/campaigns")
  revalidatePath("/campaigns/[slug]", "page")
  revalidatePath("/u/[handle]", "page")
  revalidatePath("/me/campaigns/[id]", "page")
  revalidatePath("/me/accounts")
  revalidatePath("/admin")
  revalidatePath("/admin/reports")
  revalidatePath("/admin/accounts")
  revalidatePath("/admin/account-swaps")
  // Mirrors give.organizers_reset_verification.
  const reset =
    (existing?.verification_status === "verified" || existing?.verification_status === "pending") &&
    (existing.legal_name !== parsed.data.legal_name ||
      existing.display_name !== parsed.data.display_name ||
      existing.kind !== parsed.data.kind)
  return done(reset ? "Đã lưu. Hồ sơ cần được xác minh lại vì tên hoặc loại đã đổi." : "Đã lưu hồ sơ người tổ chức.")
}

/** Creates a draft campaign and opens it in the editor. */
export async function createCampaign(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const parsed = newCampaignSchema.safeParse(formFields(form, ["type", "title", "goal_amount"]))
  if (!parsed.success) return fail(firstError(parsed.error))
  const { type, title, goal_amount } = parsed.data

  const template = getCampaignTemplate(form.get("template_id"))
  const activeTemplate = template && template.id !== "blank" ? template : null

  const db = dbAs(session.accessToken)
  let categoryId: string | null = null
  if (activeTemplate?.categorySlug) {
    try {
      const categories = await listCategories(db)
      const matched = categoriesFor(categories, type).find((c) => c.slug === activeTemplate.categorySlug)
      categoryId = matched?.id ?? null
    } catch (error) {
      console.error("createCampaign category lookup failed", error)
      categoryId = null
    }
  }

  let id: string | null = null
  // A random suffix makes a slug clash unlikely; retry once if it happens.
  for (let attempt = 0; attempt < 2 && !id; attempt++) {
    const draft = activeTemplate
      ? {
          slug: uniqueSlug(title),
          type,
          funding_model: fundingModelFor(type),
          organizer_id: session.user.id,
          title,
          goal_amount,
          ...(categoryId ? { category_id: categoryId } : {}),
          ...(activeTemplate.summary ? { summary: activeTemplate.summary } : {}),
          ...(activeTemplate.story ? { story: activeTemplate.story } : {}),
        }
      : {
          slug: uniqueSlug(title),
          type,
          funding_model: fundingModelFor(type),
          organizer_id: session.user.id,
          title,
          goal_amount,
        }
    const { data, error } = await db.from("campaigns").insert(draft).select("id").single()
    if (!error) id = (data as { id: string }).id
    else if (error.code !== "23505") {
      return fail(error.code === "23503" ? "Hãy tạo hồ sơ người tổ chức trước." : dbErrorMessage(error))
    }
  }
  if (!id) return fail(dbErrorMessage({ code: "23505" }))

  if (activeTemplate) {
    for (const faq of activeTemplate.starterFaqs) {
      try {
        const { error } = await db.rpc("upsert_campaign_faq", {
          p_campaign_id: id,
          p_question: faq.question,
          p_answer: faq.answer,
          p_faq_id: null,
          p_position: null,
        })
        if (error) console.error("createCampaign starter FAQ failed", error)
      } catch (error) {
        console.error("createCampaign starter FAQ threw", error)
      }
    }
  }

  revalidatePath("/me/campaigns")
  redirect(`/me/campaigns/${id}`)
}
