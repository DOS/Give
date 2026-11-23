import { buttonClass } from "@/components/ui/Button"

/** Compact chrome-free not-found card sized for `/embed/[slug]` iframes. */
export default function EmbedNotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col justify-between rounded-[12px] border border-border bg-raised p-4 text-fg">
      <div>
        <p className="text-sm font-bold text-primary">Give</p>
        <h1 className="mt-2 text-h3 font-semibold text-fg">Không tìm thấy chiến dịch</h1>
        <p className="mt-1 text-sm text-muted">Chiến dịch này không tồn tại, chưa công khai hoặc đang tạm dừng.</p>
      </div>
      <div className="pt-3">
        <a
          href="/campaigns"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Khám phá chiến dịch
          <span className="sr-only"> (mở thẻ mới)</span>
        </a>
      </div>
    </div>
  )
}
