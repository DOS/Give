/** The rules finance follows on /admin/refunds and each campaign's page (DOS/Give#203). */
export function RefundsIntro() {
  return (
    <>
      <p>
        Người tổ chức tự giải trình các khoản tiền ra của chiến dịch, kể cả khoản hoàn tiền cho người ủng hộ. Riêng
        khoản hoàn tiền cho lượt ủng hộ của chính người tổ chức thì họ không tự ghi được, nên bộ phận tài chính ghi ở
        đây sau khi đối chiếu sao kê và chứng từ chuyển khoản.
      </p>
      <p>
        Chỉ ghi khoản hoàn tiền; các khoản chi khác để người tổ chức giải trình. Bạn không ghi được khoản hoàn cho lượt
        ủng hộ của chính mình. Giải trình đã gửi thì không sửa được, và hiện trên sao kê công khai khi chiến dịch công
        khai.
      </p>
    </>
  )
}
