import { ChevronDownIcon } from "@/components/ui/icons"
import { sortFaqs, type CampaignFaq } from "@/lib/campaign-faqs"

/**
 * Accessible public FAQ accordion for /campaigns/[slug] (DOS/Give#316).
 * Uses native <details>/<summary> for zero-JS keyboard accessibility and
 * plain text rendering (no raw HTML/Markdown injection).
 */
export function CampaignFaqAccordion({ faqs }: { faqs: readonly CampaignFaq[] }) {
  const ordered = sortFaqs(faqs)
  if (ordered.length === 0) return null

  return (
    <section id="hoi-dap" aria-labelledby="faq-heading" className="scroll-mt-24">
      <h2 id="faq-heading" className="text-h2">
        Câu hỏi thường gặp
      </h2>
      <div className="mt-6 divide-y divide-border card">
        {ordered.map((faq) => (
          <details key={faq.id} className="group px-4 py-1 sm:px-6">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold text-fg transition-colors duration-150 hover:text-primary [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 break-words">{faq.question}</span>
              <ChevronDownIcon
                width={20}
                height={20}
                className="shrink-0 text-muted transition-transform duration-150 group-open:rotate-180"
              />
            </summary>
            <div className="pt-1 pb-4">
              <p className="max-w-[68ch] text-base break-words whitespace-pre-line text-fg">{faq.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
