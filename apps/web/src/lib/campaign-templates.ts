import type { CampaignType } from "./campaigns"

export type CampaignTemplateId =
  "blank" | "medical_emergency" | "education_community" | "relief_environment" | "creative_product"

export interface CampaignTemplateFaq {
  question: string
  answer: string
}

export interface CampaignTemplate {
  id: CampaignTemplateId
  name: string
  tagline: string
  type: CampaignType
  categorySlug: string | null
  suggestedGoal: number | null
  titlePlaceholder: string
  summary: string
  story: string
  starterFaqs: readonly CampaignTemplateFaq[]
}

const goalFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

/** Formats a template's suggested VND goal without currency symbol for numeric inputs. */
export function formatTemplateGoal(goal: number): string {
  return goalFormatter.format(goal)
}

export const CAMPAIGN_TEMPLATES: readonly CampaignTemplate[] = [
  {
    id: "blank",
    name: "Tự tạo từ đầu",
    tagline: "Bắt đầu với bản nháp trống, tự chọn danh mục và viết toàn bộ nội dung.",
    type: "give",
    categorySlug: null,
    suggestedGoal: null,
    titlePlaceholder: "",
    summary: "",
    story: "",
    starterFaqs: [],
  },
  {
    id: "medical_emergency",
    name: "Hỗ trợ y tế khẩn cấp",
    tagline: "Viện phí, phẫu thuật, điều trị bệnh hiểm nghèo cho cá nhân hoặc gia đình.",
    type: "give",
    categorySlug: "healthcare",
    suggestedGoal: 100_000_000,
    titlePlaceholder: "Ví dụ: Chung tay hỗ trợ chi phí phẫu thuật cho bé Minh Anh",
    summary:
      "Kêu gọi chung tay hỗ trợ chi phí điều trị, phẫu thuật và hồi phục sức khỏe cho [tên người bệnh], giúp gia đình vượt qua giai đoạn khó khăn trước mắt.",
    story: [
      "## Hoàn cảnh hiện tại",
      "",
      "[Giới thiệu ngắn gọn về người bệnh: họ tên, độ tuổi, nơi sinh sống, gia cảnh hiện tại và chẩn đoán từ bác sĩ.]",
      "",
      "## Tình trạng điều trị và chi phí dự kiến",
      "",
      "[Nêu rõ bệnh viện đang điều trị, phác đồ hoặc ca phẫu thuật sắp tới, cùng lý do gia đình không đủ khả năng tự chi trả.]",
      "",
      "- Chi phí phẫu thuật / điều trị chính: [Điền số tiền ước tính] ₫",
      "- Thuốc men, vật tư y tế ngoài bảo hiểm: [Điền số tiền ước tính] ₫",
      "- Chi phí chăm sóc và đi lại dự kiến: [Điền số tiền ước tính] ₫",
      "",
      "## Cam kết minh bạch và cập nhật",
      "",
      "Toàn bộ số tiền quyên góp được chuyển trực tiếp qua tài khoản đã xác minh của chiến dịch. Chúng tôi sẽ đăng tải hóa đơn viện phí, giấy xác nhận điều trị và cập nhật tình hình sức khỏe định kỳ để cộng đồng cùng theo dõi.",
    ].join("\n"),
    starterFaqs: [
      {
        question: "Số tiền ủng hộ sẽ được sử dụng vào những khoản nào?",
        answer:
          "Toàn bộ kinh phí được ưu tiên thanh toán trực tiếp cho viện phí, thuốc men và vật tư điều trị của [tên người bệnh] theo bảng kê của bệnh viện. Mọi khoản chi đều có hóa đơn, chứng từ kèm theo trên trang sao kê.",
      },
      {
        question: "Tôi có thể xem giấy tờ bệnh án và cập nhật tiến triển ở đâu?",
        answer:
          "Chúng tôi sẽ cập nhật định kỳ tình trạng sức khỏe và các biên lai thanh toán viện phí tại mục Cập nhật của chiến dịch (các thông tin cá nhân nhạy cảm được che mờ theo quy định).",
      },
      {
        question: "Nếu số tiền nhận được vượt mức viện phí thực tế thì sao?",
        answer:
          "Phần kinh phí dư sau khi hoàn tất điều trị sẽ được dùng cho quá trình phục hồi chức năng hoặc chuyển tiếp minh bạch cho [phương án xử lý cụ thể, ví dụ: quỹ hỗ trợ bệnh nhân cùng khoa] và thông báo công khai.",
      },
    ],
  },
  {
    id: "education_community",
    name: "Giáo dục & Cộng đồng",
    tagline: "Học bổng, sách vở, sửa chữa lớp học hoặc dự án nâng đỡ cộng đồng.",
    type: "give",
    categorySlug: "education-charity",
    suggestedGoal: 50_000_000,
    titlePlaceholder: "Ví dụ: Góp sách và tủ đọc cho điểm trường tiểu học vùng cao",
    summary:
      "Gây quỹ trao [học bổng / sách vở / thiết bị học tập] cho [số lượng] học sinh tại [địa phương], giúp các em có điều kiện học tập an toàn và bền vững.",
    story: [
      "## Bối cảnh và nhu cầu thực tế",
      "",
      "[Mô tả địa điểm triển khai, thực trạng trường lớp hoặc hoàn cảnh của các em học sinh, người thụ hưởng hiện nay.]",
      "",
      "## Kế hoạch triển khai và dự toán ngân sách",
      "",
      "[Liệt kê từng hạng mục cụ thể dự kiến thực hiện cùng thời gian hoàn thành.]",
      "",
      "- Hạng mục 1 ([Ví dụ: 50 suất học bổng / 500 đầu sách]): [Điền số tiền] ₫",
      "- Hạng mục 2 ([Ví dụ: Sửa chữa bàn ghế / chi phí vận chuyển]): [Điền số tiền] ₫",
      "- Dự phòng phát sinh: [Điền số tiền hoặc ghi 0] ₫",
      "",
      "## Cách chúng tôi báo cáo kết quả",
      "",
      "Sau khi hoàn thành trao tặng hoặc nghiệm thu công trình, chúng tôi sẽ đăng tải danh sách bàn giao, biên bản xác nhận của nhà trường/địa phương và hình ảnh thực tế tại mục Cập nhật.",
    ].join("\n"),
    starterFaqs: [
      {
        question: "Đối tượng thụ hưởng của chiến dịch được lựa chọn như thế nào?",
        answer:
          "Chúng tôi phối hợp với [tên trường / chính quyền địa phương / đối tác cộng đồng] để rà soát danh sách thực tế, ưu tiên các trường hợp có hoàn cảnh khó khăn nhất và công bố tiêu chí rõ ràng.",
      },
      {
        question: "Dự kiến khi nào chương trình sẽ được triển khai?",
        answer:
          "Chiến dịch dự kiến triển khai vào [tháng/năm] ngay sau khi kết thúc đợt gây quỹ hoặc đạt đủ kinh phí cho từng hạng mục. Lịch trình cụ thể sẽ được thông báo trước qua mục Cập nhật.",
      },
      {
        question: "Nếu chưa đạt đủ 100% mục tiêu, chiến dịch có thực hiện không?",
        answer:
          "Chiến dịch sử dụng mô hình gây quỹ linh hoạt. Nếu chưa đạt đủ mục tiêu ban đầu, chúng tôi sẽ điều chỉnh quy mô tương ứng với số tiền thực nhận và thông báo công khai phương án điều chỉnh.",
      },
    ],
  },
  {
    id: "relief_environment",
    name: "Cứu trợ & Môi trường",
    tagline: "Cứu trợ khẩn cấp sau thiên tai, nhu yếu phẩm hoặc phục hồi môi trường.",
    type: "give",
    categorySlug: "disaster-relief",
    suggestedGoal: 150_000_000,
    titlePlaceholder: "Ví dụ: Gửi nhu yếu phẩm khẩn cấp tới bà con vùng ngập lụt miền Trung",
    summary:
      "Huy động nguồn lực khẩn cấp hỗ trợ [nhu yếu phẩm / trồng cây / khắc phục hậu quả thiên tai] cho cộng đồng tại [khu vực chịu ảnh hưởng].",
    story: [
      "## Tình hình khẩn cấp tại địa phương",
      "",
      "[Mô tả khu vực bị ảnh hưởng bởi thiên tai hoặc vấn đề môi trường, mức độ thiệt hại và nhu cầu cấp thiết trong những ngày tới.]",
      "",
      "## Phương án cứu trợ và phân bổ nguồn lực",
      "",
      "[Nêu rõ đơn vị phối hợp tại địa phương, tuyến vận chuyển và danh mục hàng hóa/hoạt động cụ thể.]",
      "",
      "- Nhu yếu phẩm / vật tư thiết yếu ([gạo, nước sạch, thuốc, cây giống...]): [Điền số tiền] ₫",
      "- Chi phí vận chuyển và hậu cần tại hiện trường: [Điền số tiền] ₫",
      "- Hỗ trợ khắc phục sau sự cố: [Điền số tiền] ₫",
      "",
      "## Minh bạch tài chính và nghiệm thu",
      "",
      "Mọi giao dịch thu chi đều đối soát trên sao kê ngân hàng công khai. Chúng tôi sẽ cập nhật biên nhận mua hàng, xác nhận tiếp nhận từ địa phương và hình ảnh phân phối thực tế.",
    ].join("\n"),
    starterFaqs: [
      {
        question: "Hàng cứu trợ hoặc kinh phí được chuyển đến địa phương bằng cách nào?",
        answer:
          "Nhóm thực hiện phối hợp trực tiếp với [tổ chức / địa phương / đội tình nguyện] tại [địa bàn] để mua sắm tập trung và trao tận tay hộ dân theo danh sách xác nhận.",
      },
      {
        question: "Tần suất cập nhật tiến độ thực hiện của chiến dịch ra sao?",
        answer:
          "Trong giai đoạn khẩn cấp, chúng tôi cập nhật [hằng ngày / 2–3 ngày một lần] về lượng hàng đã xuất kho, tiến độ trao tặng và bảng kê chi phí phát sinh.",
      },
      {
        question: "Tôi muốn đóng góp bằng hiện vật thay vì chuyển khoản có được không?",
        answer:
          "Hiện nền tảng Give ghi nhận và đối soát các khoản đóng góp tài chính qua sao kê minh bạch. Nếu muốn gửi hiện vật, bạn có thể liên hệ qua thông tin do người tổ chức chia sẻ trong phần Câu chuyện hoặc trang hồ sơ công khai (nếu có).",
      },
    ],
  },
  {
    id: "creative_product",
    name: "Sản phẩm & Dự án sáng tạo",
    tagline: "Ra mắt sản phẩm công nghệ, ấn phẩm, trò chơi hoặc thiết kế có phần quà.",
    type: "back",
    categorySlug: "technology",
    suggestedGoal: 80_000_000,
    titlePlaceholder: "Ví dụ: Bàn phím cơ tiếng Việt — Phiên bản đầu tiên cho cộng đồng",
    summary:
      "Dự án phát triển [tên sản phẩm/tác phẩm] dành cho [nhóm người dùng], cam kết giao phần quà cho người ủng hộ khi đạt đủ mục tiêu sản xuất.",
    story: [
      "## Ý tưởng và điểm khác biệt của dự án",
      "",
      "[Giới thiệu sản phẩm hoặc tác phẩm bạn đang xây dựng, vấn đề mà nó giải quyết và lý do dự án cần sự đồng hành từ cộng đồng.]",
      "",
      "## Tiến độ hiện tại và lộ trình sản xuất",
      "",
      "[Chia sẻ trạng thái nguyên mẫu (prototype), các mốc hoàn thiện và thời gian dự kiến giao quà cho người ủng hộ.]",
      "",
      "- Giai đoạn 1 — Hoàn thiện thiết kế & nguyên mẫu: [Điền thời gian dự kiến]",
      "- Giai đoạn 2 — Sản xuất hàng loạt & kiểm tra chất lượng: [Điền thời gian dự kiến]",
      "- Giai đoạn 3 — Đóng gói và giao quà cho người ủng hộ: [Điền tháng/năm dự kiến]",
      "",
      "## Rủi ro và cam kết với người ủng hộ",
      "",
      "Dự án hoạt động theo hình thức đạt mục tiêu mới thu tiền (all-or-nothing). [Liệt kê 1–2 rủi ro chính về chuỗi cung ứng hoặc sản xuất và cách đội ngũ dự phòng xử lý.]",
    ].join("\n"),
    starterFaqs: [
      {
        question: "Nếu dự án không đạt đủ 100% mục tiêu thì cam kết của tôi thế nào?",
        answer:
          "Dự án áp dụng mô hình đạt mục tiêu mới thu tiền. Bạn chưa phải chuyển khoản khi cam kết; nếu dự án không đạt mục tiêu khi hết hạn, mọi cam kết sẽ tự động hủy.",
      },
      {
        question: "Thời gian giao phần quà dự kiến và phí vận chuyển tính như thế nào?",
        answer:
          "Thời gian giao dự kiến được ghi rõ trên từng gói phần quà. Phí vận chuyển (nếu có) và phạm vi giao hàng sẽ được nêu cụ thể ở ghi chú giao quà của từng mức ủng hộ.",
      },
      {
        question: "Tôi có thể thay đổi gói phần quà hoặc thông tin nhận hàng sau khi cam kết không?",
        answer:
          "Trong thời gian dự án đang mở gây quỹ và trước khi chốt đơn sản xuất, bạn có thể vào mục quản lý cam kết cá nhân trên Give để điều chỉnh gói quà hoặc địa chỉ nhận hàng.",
      },
    ],
  },
]

/** Allowlist lookup returning a curated template by id, or null when missing/unknown. */
export function getCampaignTemplate(id: unknown): CampaignTemplate | null {
  if (typeof id !== "string") return null
  return CAMPAIGN_TEMPLATES.find((template) => template.id === id) ?? null
}
