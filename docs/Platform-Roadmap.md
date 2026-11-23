# Give — Lộ trình Sản phẩm & Kỹ thuật (Product & Engineering Roadmap)

> Tài liệu lộ trình đang được duy trì cho nền tảng Give (Next.js 16 + Supabase schema `give` trong `DOS/DOS.Me`).
> Kế hoạch prototype 8 tuần dùng Strapi/Stripe/Docker/Giveth từ năm 2025 đã được lưu trữ trong lịch sử git.

---

## 1. Ảnh chụp trạng thái (2026-11-23)

Dự án đang tạm dừng gọn gàng theo quyết định của **JOY**:

| Môi trường           | Nhánh  | URL                    | Phiên bản đang phục vụ                                                                                                  | Ghi chú                                                                                                                 |
| -------------------- | ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Production**       | `main` | `https://give.vn`      | Give v1 + Wave 1/2 + Give v2 (`#313`–`#320`, `PR #330`) + **Give v2.1 Polish (`#331`, PRs `#332` / `#333`, `55f4b60`)** | Trực tiếp trên Vercel (`metados/give`) và Supabase Production; xem lịch sử promote tại [CHANGELOG.md](../CHANGELOG.md). |
| **Beta**             | `dev`  | `https://beta.give.vn` | **Give v3 (`#334`–`#338`, PRs `#340`–`#345` + `DOS/DOS.Me#1908`)**                                                      | Sau Vercel Deployment Protection SSO; nhắm tới nhánh Supabase Beta. Đang chờ duyệt promote lên Production.              |
| **Backlog tạm dừng** | —      | —                      | `#339` (Post-funding Backer Surveys)                                                                                    | Mở sẵn trên GitHub Board, chờ thực thi khi nối lại.                                                                     |

Nguyên tắc bất biến (chi tiết ở [docs/Give-Technical-Design.md](Give-Technical-Design.md) và [AGENTS.md](../AGENTS.md)):

- **Nền tảng không giữ tiền:** mọi khoản ủng hộ đi thẳng vào tài khoản nhận của từng chiến dịch; Give ghi nhận, đối soát và công khai từ `give.ledger_entries`.
- **Không dùng Docker / Supabase cục bộ:** toàn bộ DDL của schema `give` nằm trong `DOS/DOS.Me` (`supabase/migrations/*give*`) và chạy `Supabase migration replay` + `Give pgTAP tests` trên GitHub CI của `DOS/DOS.Me`.

---

## 2. Đã phát hành trên Production (`main` / `https://give.vn`)

- **M0 — Nền móng:** Next.js 16 App Router (`src/proxy.ts`), đăng nhập DOS.Me OAuth 2.1 (PKCE + `__Host-` cookies), hồ sơ & xác minh người tổ chức, 16 danh mục Give/Back, trình soạn thảo chiến dịch, hàng chờ kiểm duyệt `/admin` với khóa chống tự duyệt, trang khám phá `/campaigns` và trang chi tiết `/campaigns/[slug]`, thiết kế theo [DESIGN.md](../DESIGN.md).
- **M1 core — Give & đối soát sao kê:** ủng hộ `give` qua VietQR, mã đối chiếu & liên kết theo dõi đa thiết bị cho khách vãng lai (`/donations/[code]`, `/donations/[code]/track`), quản lý tài khoản nhận (`/me/accounts`, `/admin/accounts`), import sao kê CSV/XLSX (`tcb-business`, hàng chờ duyệt/khôi phục tin cậy `/admin/statements`), khớp tự động/thủ công (`/me/campaigns/[id]/unmatched`, `/admin/unmatched`), sao kê công khai `/campaigns/[slug]/statement`, giải trình khoản chi & chứng từ ảnh (`/me/campaigns/[id]/disbursements`, `/admin/evidence`), đổi tài khoản nhận giữa chiến dịch (`/admin/account-swaps`, `/admin/own-transfers`), hoàn tiền & giao dịch bị ngân hàng trả lại (`/admin/refunds`), chốt chiến dịch tự động.
- **M3 — Back (All-or-Nothing):** cam kết `/campaigns/[slug]/pledge`, bậc quà tặng (`reward_tiers`), hạn thanh toán/nhắc nhở/tự hủy quá hạn (`lapse-pledges`, `remind-pledges`), quản lý giao quà (`/me/campaigns/[id]/fulfillment`), dừng/mở lại yêu cầu thanh toán (`/admin/payment-requests`).
- **M4 core — Kiểm duyệt & vận hành:** báo cáo chiến dịch (`/admin/reports`), phân quyền nhân viên `/admin/roles` (`moderator`, `finance`, `admin`), hàng chờ email giao dịch `give.outbox` (`/admin/emails`, `/email/unsubscribe`, crons `send-outbox` / `purge-outbox`) — mã nguồn và DB đã lên Production, chờ cấp quyền AWS SES Production để gửi thật.
- **Wave 1 (`#250`–`#255`, `#258`–`#264`, `#268`–`#270`, `#275`/`#276`, `#281`–`#283`, `#287`, `#292`, `#299`; PRs `#256`, `#257`, `#265`–`#267`, `#271`–`#272`, `#274`, `#279`–`#280`, `#284`–`#286`, `#288`–`#290`, `#293`–`#298`, `#300`–`#301`):** trang công khai người tổ chức `/u/[handle]`, video giới thiệu YouTube, ghi chú mở khóa mốc mục tiêu, đồng tổ chức chỉnh sửa chiến dịch qua liên kết mời một lần (`/invites/[token]`, giữ ranh giới tiền riêng cho chủ chiến dịch), thống kê ẩn danh `/me/campaigns/[id]?tab=analytics`, bình luận 1 cấp & kiểm duyệt (`/admin/reports/comments`), bản nháp cập nhật chiến dịch, lịch sử trạng thái, `BreadcrumbList` JSON-LD, hàng chờ email `give.outbox` (`#254`), gói ủng hộ hằng tháng Bước 1 — Phương án A (`/plans/stop`, crons `issue-plan-donations` / `plan-notices`), nâng cấp `read-excel-file` (`#289`), và cập nhật cấu hình PO cùng quy tắc bỏ Docker/Supabase cục bộ (`#280`, `#292`/`#293`, `#294`).
- **Wave 2 (`#273`, `#77`, `#291`, `#308`, `#92`, `#303`):** cải tiến claim timeout & kiểm tra JWT Production cho email outbox (`#273`), khóa chống xung đột chuyển trạng thái và hàng chờ khôi phục chiến dịch trước khi mở (`#77`), email thông báo đổi tài khoản cho người góp hằng tháng (`#291`), tối ưu batch/log cho cron kế hoạch hằng tháng (`#308`), đổi tài khoản nhận cho chiến dịch `back` + thông báo `payment_due` (`#92`), và cập nhật cấu hình PO (`#303`).
- **Give v2 (`#313`–`#320` / `#330`) & Give v2.1 Polish (`#331` / `#333`):**
  - Chia sẻ lan tỏa: thẻ Open Graph động (`/campaigns/[slug]/opengraph-image`), poster QR tải xuống (`9:16` / `1:1`), thẻ cảm ơn `"Tôi đã chung tay"` (`#313`).
  - Lá chắn minh bạch: hộp tóm tắt minh bạch 3 giây, gắn chứng từ chi theo mốc mục tiêu, báo cáo tổng kết cuối chiến dịch (`#314`).
  - Giữ chân & tiền ra mắt: theo dõi chiến dịch và người tổ chức (ẩn danh tính theo `handle`), chế độ `"Sắp ra mắt"` (`prelaunch_public`), thông báo mở chiến dịch/cập nhật mới, thẻ `"Dấu ấn đóng góp của tôi"` trên `/me/contributions` (`#315`).
  - Năng suất người tạo: câu hỏi thường gặp có cấu trúc (`FAQ`) & nhân bản nháp chiến dịch (`#316`).
  - Chuyển đổi `back`: bậc quà Early Bird giới hạn thời gian và số suất (`#317`).
  - Discovery 2.0: bộ lọc nhanh `ending_soon`, `almost_funded`, `recently_audited`, dải nổi bật trang chủ và độ tươi sao kê chống giả mạo (`#318`).
  - Đại sứ chiến dịch (`?ref=`): bảng xếp hạng tự chọn tham gia, tóm tắt trên `/me` cùng nút bật/tắt hiển thị (`#319`, `#331`).
  - Tường lời chúc cộng đồng (`#tuong-loi-chuc`): thả tim, báo cáo & hàng chờ kiểm duyệt `/admin/reports/wishes` (`#320`).

---

## 3. Đã hoàn thành trên Beta (`dev` / `https://beta.give.vn`), chờ promote lên Production

Toàn bộ **Give v3 (`#334`–`#338`)** đã merge vào `dev` (`PR #340`–`#345`) và `DOS/DOS.Me` `dev` (`DOS/DOS.Me#1908`):

- **`#334` (`PR #341`) — SEO & Google Growth Engine:** `/robots.txt` (`allow: ["/", "/media/public/"]`, chặn vùng riêng tư/nhúng), `/sitemap.xml` động qua `dbAs()` ẩn danh (tối đa 5.000 chiến dịch công khai, `/statement` chỉ khi `isPublicStatus`, hồ sơ `/u/[handle]`), cùng `WebSite`/`SearchAction`, `FAQPage` và `ProfilePage` JSON-LD qua `safeJsonLd`.
- **`#335` (`PR #342`) — Embeddable campaign widget (`/embed/[slug]`):** thẻ nhúng chỉ đọc không cookie/không form/không lộ VietQR (`?theme=light|dark|auto`, `?compact=1`, `?ref=`), nút sao chép mã `<iframe>` trên `/campaigns/[slug]`, cách ly CSP `frame-ancestors *` trên `/embed/:path*` trong khi giữ `X-Frame-Options: DENY` toàn site và chặn `/Embed*` viết hoa lẫn header giả mạo `x-give-embed` trong `src/proxy.ts`.
- **`#336` (`PR #340`) — Public transparency export:** tải CSV sao kê chuẩn RFC-4180 có UTF-8 BOM và vô hiệu hóa công thức (`GET /campaigns/[slug]/statement/export`, tối đa 5.000 dòng, `s-maxage=60`, loại khỏi session rotation của `proxy.ts`), kèm giao diện in / lưu PDF thân thiện (`@media print`, `.print-only`).
- **`#337` (`PR #344`, `DOS/DOS.Me#1908`) — Follower hub & 48h closing-soon reminders:** trang `/me/following` (chiến dịch & người tổ chức đang theo dõi, che số liệu đã nhận và tiến độ trên teaser sắp ra mắt, badge `"Đã ủng hộ"`), cùng cron hằng giờ `GET /api/cron/remind-closing` (`20 * * * *`) gọi `give.remind_closing_campaigns()` gửi thông báo `campaign_closing_soon` chỉ trong ứng dụng (`give.notices`, không chạm `give.outbox`).
- **`#338` (`PR #343`) — Quick-start campaign templates on `/start`:** bộ chọn 5 mẫu khởi tạo tiếng Việt (`blank` + 4 mẫu y tế, giáo dục/cộng đồng, cứu trợ/môi trường, sản phẩm sáng tạo) điền sẵn loại, danh mục gợi ý, mục tiêu gợi ý, tóm tắt, câu chuyện Markdown và 3 FAQ khởi đầu.

---

## 4. Ưu tiên khi nối lại (Next on Resume)

1. **Promote Give v3 (`#334`–`#338`) lên Production (`https://give.vn`):**
   - Trong `DOS/DOS.Me`: tạo PR đưa `20261204110000_give_following_and_closing_reminders.sql` (`#1908`) lên `main` (kiểm tra xem trên `main` đã có migration timestamp lớn hơn `20261204110000` hay chưa; nếu có thì tạo consolidated `late_apply`, nếu chưa thì selective-promotion PR trực tiếp).
   - Sau khi `DOS/DOS.Me` `main` áp dụng migration thành công, mở `DOS/Give` PR `dev -> main` sau khi xin **JOY** phê duyệt qua popup `ask_question` theo [docs/product-owner-config.md](product-owner-config.md).
2. **Triển khai `#339` — Post-funding Backer Surveys cho chiến dịch `back`:**
   - Hiện đang tạm dừng ở Backlog (chờ thực thi khi nối lại).
   - Gồm `DOS/DOS.Me` migration `20261204120000_give_backer_surveys.sql` (sau `20261204110000`, giữ ranh giới `#264` chỉ chủ sở hữu chiến dịch quản lý khảo sát và xem câu trả lời) và `DOS/Give` PR: trình tạo khảo sát, form trả lời cho người đồng hành trên `/me/pledges/[code]`, thông báo `survey_ready`, và route xuất CSV giao quà/khảo sát tái sử dụng `lib/csv.ts`.
3. **Visual QA tùy chọn:** kiểm tra giao diện thực tế trên trình duyệt (`beta.give.vn` / `give.vn`) cho các luồng Give v2.1 và Give v3.

---

## 5. Hạng mục mở: Xác minh thực tế & Bị chặn bên ngoài

Danh sách dưới đây đối chiếu trực tiếp 14 issue xác minh/bị chặn đang mở trên `DOS/Give` (ngoài `#334`–`#338` đã xong trên Beta ở mục 3 và `#339` đang tạm dừng ở mục 4):

### 5.1 Đã có code/DB trên Production hoặc Beta, chờ xác minh thực tế / cổng ngoài

- **`#254` — M4: email outbox and first transactional emails:** DB và app đã lên Production (`2026-11-22`); đang chờ AWS SES Production access (case `179510877400994` hiện còn trong sandbox).
- **`#275`, `#276` — Monthly donations A (DB & app):** DB và app đã lên Production (`2026-11-22`); giữ mở chờ checklist kiểm thử end-to-end trên Beta/Production.
- **`#17` — M1 app: statement parsers for the first 1-2 banks:** parser Techcombank Business (`tcb-business`, `#231`) đã lên Production (`2026-11-18`); giữ mở chờ file sao kê CSV/XLSX ẩn danh thật từ JOY để xác nhận header/`hasStableRowId` (và làm parser ACB khi có người tổ chức cần).
- **`#46` — Receiving-account verification test transfer:** đã chốt đích chuyển khoản thử là tài khoản Techcombank Business của JOY (`2026-11-18`); chờ hoàn tất thu thập chứng từ chạy thật.
- **`#23` — M1 acceptance on beta:** kịch bản nghiệm thu toàn vòng từ khách vãng lai ủng hộ -> import sao kê -> đóng chiến dịch trên Beta.
- **`#57` — Statement import: deferred follow-ups from #14 reviews:** phần 1–3 đã lên Production (`2026-11-19`); còn hạng mục đối soát chéo nguồn chờ kênh M2 Tingee (`#24`) và đối soát toàn kỳ / sửa giao dịch trùng.

### 5.2 M2 Kênh tự động (chờ đối tác Tingee & viết lại scope theo D8)

- **`#24`, `#25`, `#29`:** JOY đã chốt chuyển M2 từ PayOS sang **Tingee** (`2026-11-18`, xem [docs/research/tingee.md](research/tingee.md)); đang chờ liên hệ/xác nhận Master Merchant từ Tingee trước khi viết lại scope DB (`#24`), kênh app (`#25`) và realtime + reconcile hằng ngày (`#29`).

### 5.3 Ủng hộ hằng tháng Bước 2 (chờ ngân hàng, cổng thanh toán & luật sư)

- **`#277` — Monthly donations step 2: A+ gate checks (bank test, counsel):** kiểm thử lệnh chuyển định kỳ ngân hàng và tham vấn pháp lý (P4).
- **`#278` — Monthly donations step 2: C gate checks (gateway letters, counsel):** thư hỏi cổng thanh toán (MoMo, ZaloPay, Bảo Kim) và tham vấn pháp lý (P4).

### 5.4 Platform & bảo trì phụ trợ

- **`#94`:** Gọi hàm kiểm tra điều kiện xóa tài khoản của Give từ luồng xóa tài khoản của `DOS.Me`.
- **`#167`:** Nâng cấp TypeScript 7 (`typescript-eslint` chưa hỗ trợ TS 7.0; theo dõi chờ hỗ trợ hoặc chạy song song).

---

## 6. Tầm nhìn Sau MVP (Post-MVP Horizon)

Các mở rộng nằm sau MVP và chỉ triển khai khi đủ điều kiện kỹ thuật hoặc pháp lý:

- Kênh **`bank_api`** kết nối trực tiếp khi ngân hàng đối tác mở API.
- Kênh **`crypto`** (đã dự phòng cột `asset`, `vnd_equivalent`, `chain`, `address`; chỉ bật sau khi JOY chốt pháp lý G2).
- **Phí nền tảng** (câu hỏi mở P2: tip riêng cho DOS hoặc xuất hóa đơn cho người tổ chức, giữ nguyên nguyên tắc D3 không giữ tiền).
- **Tổ chức (`public.organizations`)**, **vận chuyển có tính phí** (`requires_shipping` hiện chỉ thu địa chỉ), và **đa tiền tệ**.
