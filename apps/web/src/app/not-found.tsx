import { ButtonLink } from "@/components/ui/Button"
import { SearchIcon } from "@/components/ui/icons"

/** A page that does not exist or is not public (DESIGN.md 6, empty state), centered in the container. */
export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-16 text-center sm:py-24">
      <SearchIcon width={40} height={40} className="text-muted" aria-hidden />
      <h1 className="mt-4 text-h1-phone tracking-tight sm:text-h1">Không tìm thấy trang</h1>
      <p className="mt-3 max-w-[68ch] text-fg">Trang này không tồn tại hoặc chưa được công khai.</p>
      <ButtonLink href="/campaigns" className="mt-6">
        Khám phá chiến dịch
      </ButtonLink>
    </div>
  )
}
