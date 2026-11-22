import type { AmbassadorLeaderboardRow } from "@/lib/ambassadors"
import { formatVnd } from "@/lib/format"

const COUNT = new Intl.NumberFormat("vi-VN")

/**
 * Opt-in "Người đồng hành lan tỏa" leaderboard section on `/campaigns/[slug]`
 * (DOS/Give#319).
 *
 * Strictly rendered only on `isPublicLiveOrEnded` campaigns (never on
 * pre-launch or preview), displays ONLY `display_name`, `matched_count`, and
 * `matched_total_vnd` (zero `user_id` or PII), and hides cleanly when empty.
 */
export function AmbassadorLeaderboard({ rows }: { rows: readonly AmbassadorLeaderboardRow[] }) {
  if (rows.length === 0) return null

  return (
    <section id="nguoi-dong-hanh-lan-toa" aria-labelledby="ambassador-leaderboard-heading" className="scroll-mt-24">
      <h2 id="ambassador-leaderboard-heading" className="text-h2">
        Người đồng hành lan tỏa
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm text-muted">
        Những người đã chia sẻ liên kết kêu gọi và đồng ý hiển thị. Chỉ tính các khoản đã đối soát thực tế (đã trừ hoàn
        tiền).
      </p>

      <ol className="mt-6 divide-y divide-border card">
        {rows.map((row, index) => (
          <li
            key={row.ref_code}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 sm:flex-nowrap sm:px-6"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="inline-flex size-8 shrink-0 items-center justify-center rounded bg-surface text-sm font-semibold text-muted tabular-nums"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-semibold break-words text-fg">
                  <span className="sr-only">Hạng {index + 1}: </span>
                  {row.display_name}
                </p>
                <p className="text-sm text-muted tabular-nums">{COUNT.format(row.matched_count)} lượt ủng hộ đã khớp</p>
              </div>
            </div>
            <p className="shrink-0 font-bold text-fg tabular-nums">{formatVnd(row.matched_total_vnd)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
