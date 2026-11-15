import { formatVnd } from "@/lib/format"

/**
 * Money the organizer moved from the campaign's old account to its new one
 * after an account swap, as finance paired it (DOS/Give#84,
 * give.public_campaigns.own_transfer_amount). It is left out of both the
 * paid and the spent totals, and this line says so next to them.
 */
export function OwnTransferNote({ amount }: { amount: number }) {
  return (
    <p className="text-sm text-muted">
      Không tính <span data-figure="own_transfer">{formatVnd(amount)}</span> chuyển từ tài khoản cũ sang tài khoản mới
      của chiến dịch sau khi đổi tài khoản: đó là cùng một khoản tiền, không phải tiền ủng hộ mới hay khoản chi.
    </p>
  )
}
