# Bước 2 của ủng hộ hằng tháng: thư hỏi cổng thanh toán và phép thử ngân hàng

> Viết ngày 2026-11-19 cho DOS/Give#255. JOY chọn kiểm tra cổng của A+ và C
> **song song** (`docs/Give-Technical-Design.md` mục 4.3.3). Tài liệu này có
> hai phần để dùng ngay:
>
> - **Phần A:** thư hỏi MoMo, ZaloPay và Bảo Kim, cho phương án C (mục 4.3.6).
> - **Phần B:** phép thử lệnh chuyển tiền định kỳ trong app ngân hàng, cho
>   cổng (a) của phương án A+ (mục 4.3.5).
>
> Không có số tài khoản, mật khẩu hay thông tin bí mật nào trong tài liệu này.
> Chỗ trong ngoặc vuông `[...]` là chỗ JOY điền trước khi gửi.

## Phần A. Thư hỏi cổng thanh toán (phương án C)

Gửi cùng một thư cho từng cổng, qua kênh liên hệ đối tác hay kinh doanh chính
thức của cổng đó (trang web của cổng). Đổi `[Tên cổng]` cho từng thư. Xin trả
lời **bằng văn bản**, vì câu trả lời sẽ được lưu làm căn cứ thiết kế.

---

**Tiêu đề:** DOS hỏi về thu định kỳ cho nền tảng gây quỹ từ thiện Give

Kính gửi bộ phận Phát triển đối tác của [Tên cổng],

Tôi là [Họ tên], [chức danh] của DOS. DOS đang xây dựng **Give**, một nền tảng
gây quỹ từ thiện tại Việt Nam. Chúng tôi muốn hỏi [Tên cổng] về khả năng thu
định kỳ hằng tháng cho các chiến dịch trên Give.

**Cách Give hoạt động hiện nay**

- Mỗi chiến dịch có một tài khoản ngân hàng riêng, đứng tên người tổ chức
  (thường là cá nhân, đôi khi là tổ chức), dùng riêng cho chiến dịch đó.
- Người ủng hộ chuyển khoản VietQR **thẳng vào tài khoản đó**. Give chỉ đối
  chiếu giao dịch và công khai số liệu.
- **Give không giữ tiền và không làm trung gian thanh toán.** Tiền ủng hộ
  không bao giờ đi qua tài khoản hay số dư của DOS. Đây là nguyên tắc chúng
  tôi muốn giữ.

**Điều chúng tôi muốn làm**

Người ủng hộ liên kết ví hoặc lưu thẻ một lần với [Tên cổng], đăng ký ủng hộ
một số tiền cố định mỗi tháng cho một chiến dịch. Mỗi tháng tiền được thu tự
động và về tài khoản của người tổ chức chiến dịch đó. Give dừng thu khi chiến
dịch kết thúc, và người ủng hộ hủy được bất cứ lúc nào.

**Câu hỏi**

1. Tiền thu được có về **thẳng tài khoản ngân hàng riêng** của từng người tổ
   chức (merchant con) không, mà không đi qua tài khoản hay số dư của DOS?
2. Một **cá nhân không đăng ký kinh doanh** có làm merchant con được không?
   Nếu được, cần hồ sơ và thủ tục xác minh (KYC) gì?
3. Có thu được theo lịch **khi người ủng hộ không mở app** (lệnh do merchant
   hoặc nền tảng khởi tạo, hoặc lịch thu chạy ở phía cổng) không? Nếu lịch
   chạy ở phía cổng, nền tảng hủy lịch qua API được không, và cổng xác nhận
   việc hủy thế nào?
4. [Tên cổng] có nhận ngành hàng **ủng hộ, từ thiện** cho merchant con là cá
   nhân không?
5. Khi có **hoàn tiền hay khiếu nại (chargeback)**, bên nào chịu? **Phí** mỗi
   giao dịch là bao nhiêu, và phí được **trừ vào tiền quyết toán** hay **tính
   riêng** cho merchant con? Sau bao lâu thì tiền về (T+n)?
6. Tiền về **tài khoản ngân hàng** của merchant con, hay vào **một số dư giữ
   tại [Tên cổng]** rồi mới chi ra? Nếu là số dư: ai ra lệnh chi, theo lịch
   nào (tự động mỗi ngày, theo yêu cầu…), và nền tảng có quyền gì với số dư đó
   không?
7. Nền tảng nhận được **dữ liệu gì** cho từng lần thu (webhook hay báo cáo có
   mã giao dịch, kết quả thành công hay lỗi) và cho từng lần quyết toán (báo
   cáo đối soát liệt kê các lần thu trong khoản quyết toán)? Nền tảng có đặt
   được **ngày kết thúc** cho từng lịch thu định kỳ không?

Tài liệu thiết kế của Give là công khai (mã nguồn mở). Chúng tôi chỉ muốn ghi
vào đó bản tóm tắt kết luận từ câu trả lời của [Tên cổng]. Xin cho biết phần
nào của câu trả lời là bảo mật và không được trích dẫn.

Ngoài ra, nếu [Tên cổng] có mẫu hợp đồng nền tảng (platform) hoặc tài liệu kỹ
thuật về thu định kỳ và mô hình merchant con, xin gửi kèm để chúng tôi tham
khảo.

Chúng tôi chưa cam kết với cổng nào. Câu trả lời của [Tên cổng] giúp DOS chọn
đối tác đầu tiên cho tính năng này.

Trân trọng,
[Họ tên]
[Chức danh], DOS
[Email liên hệ công việc]

---

**Cách đọc câu trả lời.** Cổng đầu tiên trả lời "có" cho câu 1, 2, 3 và 4, và ở
câu 6 nói tiền về thẳng tài khoản ngân hàng, là ứng viên làm trước. Nếu câu 6
là "số dư giữ tại cổng" mà nền tảng không điều khiển việc chi ra, ghi lại và
chờ luật sư trả lời P4(j) (mục 9 của thiết kế).

**Lưu ở đâu.** Repo DOS/Give là repo công khai. Lưu thư trả lời ở nơi riêng tư
của DOS (không đưa vào issue hay repo), vì biểu phí và điều khoản hợp đồng có
thể là bảo mật. Trong repo chỉ ghi một bản tóm tắt kết luận (cổng nào, câu nào
"có" hay "không", ngày nhận), trong phạm vi cổng cho phép trích dẫn.

## Phần B. Phép thử lệnh chuyển tiền định kỳ (phương án A+, cổng (a))

**Mục đích.** Xác minh rằng lệnh chuyển tiền định kỳ do người dùng tự đặt trong
app ngân hàng **giữ nguyên nội dung chuyển khoản** ở **mọi lần chạy**. A+ dựa
vào điều này: người góp đặt lệnh với một mã kế hoạch dạng `GM…`, và Give chỉ
khớp được tiền nếu mã đó tới tài khoản nhận nguyên vẹn mỗi tháng.

**Cần chuẩn bị**

- Hai tài khoản **của chính JOY**: một tài khoản chuyển (Techcombank, và mỗi
  ngân hàng khác JOY có) và một tài khoản nhận.
- Tài khoản nhận phải ở **ngân hàng khác** tài khoản chuyển, vì người góp
  thường chuyển liên ngân hàng tới tài khoản của chiến dịch, và cổng (a) đòi
  lệnh liên ngân hàng. Nếu chỉ thử được trong cùng ngân hàng, vẫn làm, nhưng
  kết quả chỉ là "tạm qua" (xem phần kết luận).
- Nếu được, chọn tài khoản nhận ở ngân hàng mà Give đọc được giao dịch (qua
  Tingee, hoặc qua import sao kê), để xem nội dung đúng như kênh của Give sẽ
  thấy. Tránh VietinBank qua Tingee, vì kênh đó làm mất nội dung chuyển khoản.
- Lệnh liên ngân hàng có thể mất phí chuyển mỗi lần chạy; ghi lại phí nếu có.
- Tài khoản nhận phải xem được **chi tiết giao dịch** trong app và **tải được
  sao kê** (file hoặc trang internet banking).
- Mỗi ngân hàng chuyển dùng **một mã thử riêng, đúng dạng mã kế hoạch thật**:
  9 ký tự, bắt đầu bằng `GM`, chỉ có chữ in hoa và chữ số, không có `0`, `O`,
  `1`, `I`, `L`. Ví dụ:
  - Techcombank: `GMTXQ7K9P`
  - ngân hàng thứ hai: `GMRW4HZ3M`

  Như vậy phép thử cũng kiểm tra độ dài và các ký tự mà mã thật dùng.

**Các bước, cho mỗi ngân hàng chuyển**

1. **Tìm chức năng.** Mở app ngân hàng, tìm mục chuyển tiền định kỳ. Tên mục
   khác nhau theo ngân hàng, thường là "Chuyển tiền định kỳ", "Lịch chuyển
   tiền", "Đặt lịch chuyển tiền" hoặc nằm trong màn hình chuyển tiền với tùy
   chọn "Đặt lịch" hay "Lặp lại". Ghi lại **đường đi trong app** (ví dụ:
   Chuyển tiền → Chuyển tiền định kỳ → Tạo mới). Nếu ngân hàng không có chức
   năng này, hoặc chỉ cho chuyển định kỳ trong cùng ngân hàng, ghi lại và
   dừng ở ngân hàng đó.
2. **Tạo lệnh.**
   - Người nhận: tài khoản nhận của JOY.
   - Số tiền: **mức nhỏ nhất app cho phép** (ví dụ 10.000 đ).
   - Tần suất: **hằng tháng**, vì A+ chỉ dùng lệnh hằng tháng. Nếu muốn có kết
     quả sớm, có thể đặt thêm một lệnh hằng ngày hay hằng tuần với mã thử khác,
     nhưng kết quả của lệnh đó chỉ là "tạm qua".
   - Ngày bắt đầu: ngày gần nhất app cho phép.
   - Số lần hoặc ngày kết thúc: **2 hoặc 3 lần**, nếu app có, để lệnh tự dừng.
   - Nội dung: gõ đúng mã thử, ví dụ `GMTXQ7K9P`. Nếu app tự điền sẵn nội
     dung (ví dụ tên người chuyển), xóa đi và gõ mã thử. Ghi lại app có cho
     sửa nội dung hay không, và giới hạn số ký tự nếu có.
3. **Chụp màn hình khi tạo lệnh:**
   - màn hình nhập lệnh ngay trước khi xác nhận (thấy tần suất và nội dung);
   - màn hình báo tạo lệnh thành công;
   - danh sách lệnh định kỳ, có lệnh vừa tạo.
4. **Sau mỗi lần lệnh chạy** (ít nhất **hai lần**), chụp:
   - Bên chuyển: chi tiết giao dịch trong lịch sử giao dịch (thấy nội dung).
   - Bên nhận: thông báo biến động số dư, và chi tiết giao dịch trong app
     (thấy nội dung).
   - Bên nhận: dòng tương ứng trên **sao kê** (tải file sao kê nếu được).
   - Nếu tài khoản nhận nối với Give (Tingee hay import sao kê): nội dung giao
     dịch như Give ghi nhận.
5. **Kiểm tra nội dung bên nhận** ở mỗi lần chạy và ghi vào bảng dưới:
   - mã thử còn **đầy đủ, đúng thứ tự**, không bị cắt hay đổi ký tự;
   - ngân hàng có thêm chữ nào trước hoặc sau mã không (thường có, ví dụ mã
     giao dịch hay tên người chuyển); chép **nguyên văn** cả dòng nội dung;
   - nội dung ở lần chạy thứ hai có giống lần đầu không.
6. **Hủy lệnh** (nếu lệnh không tự dừng): vào danh sách lệnh định kỳ → chọn
   lệnh → Hủy hoặc Xóa. Chụp màn hình báo hủy thành công. Ghi lại **giờ chót
   hủy** nếu app nói (ví dụ "hủy trước 7:30 sáng ngày chạy"). Sau ngày chạy kế
   tiếp, kiểm tra bên nhận **không có thêm giao dịch nào**, và chụp màn hình
   danh sách lệnh trống.

**Bảng kết quả** (một dòng cho mỗi lần chạy):

| Ngân hàng chuyển | Ngân hàng nhận | Liên ngân hàng? | Tần suất   | Lần chạy | Ngày giờ | Nội dung bên nhận thấy (nguyên văn) | Mã còn nguyên? |
| ---------------- | -------------- | --------------- | ---------- | -------- | -------- | ----------------------------------- | -------------- |
| Techcombank      | [ngân hàng]    | [có/không]      | hằng tháng | 1        |          |                                     |                |
| Techcombank      | [ngân hàng]    | [có/không]      | hằng tháng | 2        |          |                                     |                |

**Trước khi gửi ảnh**

- Che số tài khoản (chỉ để lại 4 số cuối), số dư, tên đầy đủ và mã giao dịch
  của ngân hàng.
- Không gửi mã OTP, mật khẩu hay ảnh chứa mã QR đăng nhập.
- Gửi ảnh cho PO qua kênh riêng tư, **không** đăng lên issue hay repo (repo
  DOS/Give là công khai). Trong repo chỉ ghi kết luận: ngân hàng nào qua, đường
  đi trong app, giờ chót hủy.

**Kết luận của phép thử**

- Ngân hàng **qua** cổng (a) khi một lệnh **liên ngân hàng, hằng tháng** chạy
  hai lần và ở cả hai lần nội dung bên nhận còn nguyên mã thử. Ghi ngân hàng
  đó vào danh sách đã xác minh (mục 4.3.5), kèm đường đi trong app để tạo và
  hủy lệnh, và giờ chót hủy.
- Lệnh trong cùng ngân hàng, hay lệnh hằng ngày, hằng tuần, đạt điều kiện
  trên chỉ là **tạm qua**: ghi lại, nhưng ngân hàng chỉ vào danh sách đã xác
  minh sau khi có ít nhất một lệnh liên ngân hàng hằng tháng được kiểm tra.
- Ngân hàng **không qua** nếu mã bị cắt, đổi, hay chỉ còn ở lần chạy đầu.
- Gửi bảng kết quả và ảnh cho PO. Cổng (a) cần ít nhất **một ngân hàng lớn**
  qua; mỗi ngân hàng thêm vào danh sách thì người góp dùng ngân hàng đó mới
  chọn được A+.
