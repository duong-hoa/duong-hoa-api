# MCP cho CMS Dương Hòa

MCP dùng lại các dịch vụ backend phục vụ REST và cùng dữ liệu của CMS Dương Hòa. Agent tìm và đọc trang trong phạm vi được cấp, tạo trang nháp từ mẫu hoặc preset, sửa trường văn bản và media đã mapping, sắp xếp block và gửi phiên bản để duyệt. Trình sửa trang CMS hiển thị trạng thái, thay đổi trước/sau, nút xem trước và nút **Duyệt và xuất bản** cho quản trị viên.

## Kết nối

MCP tắt mặc định. Khi cấu hình hợp lệ, API phục vụ Streamable HTTP tại `POST /mcp`. Metadata OAuth nằm tại `GET /.well-known/oauth-protected-resource/mcp`. Host MCP dùng URL tài nguyên dưới đây và đăng nhập qua nhà cung cấp OAuth đã đăng ký trước. Một client tự động hóa đã được cấu hình có thể gửi OAuth access token ngắn hạn trong header `Authorization: Bearer …`.

| Biến API | Nội dung |
| --- | --- |
| `CMS_MCP_ENABLED` | `true` để bật. Bỏ biến hoặc đặt `false` để trả 404 cho MCP. |
| `CMS_MCP_RESOURCE_URL` | URL chính xác của tài nguyên MCP, ví dụ `https://mcp.example.org/mcp`. |
| `CMS_MCP_OAUTH_ISSUER` | Issuer chính xác từ nhà cung cấp OAuth. |
| `CMS_MCP_OAUTH_JWKS_URL` | URL bộ khóa công khai JWKS của issuer. |
| `CMS_MCP_ALLOWED_ORIGINS` | Origin bổ sung, cách nhau bằng dấu phẩy, nếu host MCP gửi header Origin khác origin tài nguyên. |
| `CMS_MCP_AGENTS` | JSON array định danh và cấp quyền Agent. Mỗi `key` ổn định được dùng để nhận diện các bản nháp và nhật ký. |

Ví dụ giá trị của `CMS_MCP_AGENTS` với mã minh họa:

```json
[
  {
    "key": "hillbrook-editor",
    "subject": "oauth-subject",
    "clientId": "registered-mcp-client",
    "scopes": ["cms:read", "cms:draft", "cms:media", "cms:review"],
    "sourcePageIds": ["123e4567-e89b-42d3-a456-426614174000"]
  }
]
```

Issuer phải phát JWT access token có `typ: at+jwt`, chữ ký RS256 hoặc ES256, `iss`, `sub`, `client_id`, `iat`, `exp`, `scope` và duy nhất một audience trùng URL tài nguyên. Tuổi tối đa của token là một giờ. Phạm vi cấp thực tế là giao của `scope` trong token và quyền đã cấu hình. Dùng HTTPS cho issuer, JWKS, tài nguyên và Origin trong production. HTTP loopback chỉ dành cho QA ngoài production.

- `cms:read` bắt buộc. Agent đọc mẫu và trang đã xuất bản theo ID được cấp cùng bản nháp do chính Agent tạo.
- `cms:draft` cho phép tạo bản nháp và sửa bản nháp sở hữu trước lần xuất bản đầu tiên.
- `cms:media` cho phép đọc thư viện media của dự án và thay media bằng mục đã đăng ký hoặc trường media của block Agent được đọc. Tệp mới đi qua trình tải ảnh/video CMS.
- `cms:review` cho phép gửi nháp lên trình sửa CMS. Thao tác xuất bản dùng quyền quản trị viên CMS và phiên đăng nhập CMS. Token Agent có audience MCP riêng.

## OAuth cho Agent tự động trên Dương Hòa

Nếu không có issuer OAuth bên ngoài, đặt secret `CMS_MCP_SERVICE` trên riêng API Dương Hòa. Secret là JSON gồm `issuer` (origin HTTPS chính xác), `privateKey` (RSA PKCS#8 DER base64), và `clients`. Mỗi client có `key`, `subject`, `clientId`, `sourcePageIds`, `scopes` tương tự ở trên cùng `secretHash` (SHA-256 hex của client secret ngẫu nhiên có entropy cao). Web chỉ chuyển tiếp các đường dẫn MCP và OAuth đã định danh.

Agent tự động đọc metadata tại `/.well-known/oauth-authorization-server`. Gửi form `grant_type=client_credentials`, `resource=<origin>/mcp` và `scope` tới `/api/mcp/oauth/token`, với xác thực OAuth `client_secret_basic`. Token có hạn 5 phút. Client gửi Bearer token tới `/mcp`. Mặc định chỉ cấp `cms:read` khi không yêu cầu scope. Luồng này dành cho Agent có khả năng dùng client credentials, chưa cung cấp đăng nhập OAuth tương tác của người dùng.

## Công cụ và luồng duyệt

| Công cụ | Sử dụng |
| --- | --- |
| `cms_search_pages` | Tìm theo tên hoặc slug với bộ lọc loại và phân trang. |
| `cms_get_page` | Đọc revision, các block theo thứ tự, trạng thái và `adminPath`. |
| `cms_get_block` | Đọc nội dung, cấu hình, liên kết và trường được phép sửa. Dùng đường dẫn trường và locale trả về. |
| `cms_list_presets` | Đọc preset của trang và các mẫu block có mã preset lưu trên block. |
| `cms_list_media` | Tìm ảnh/video trong danh sách media đã đăng ký. |
| `cms_create_draft` | Sao chép mẫu với ID và liên kết nội bộ riêng. Có thể chọn preset trang thuộc đúng mẫu. `requestId` chống tạo trùng. |
| `cms_update_draft_block` | Sửa văn bản thuần theo ngôn ngữ hoặc thay media bằng ID thư viện/trường media nguồn. Trả thay đổi trước/sau. |
| `cms_reorder_draft_blocks` | Sắp xếp lại bằng toàn bộ danh sách ID của bản nháp. |
| `cms_submit_draft_review` | Gửi revision được chọn kèm ghi chú, trả đường dẫn CMS. |

Sửa hoặc sắp xếp cần `expectedRevision` mới nhất. Nếu CMS trả xung đột, đọc lại trạng thái và đối chiếu bản thay đổi trước khi gửi tiếp. Kiểu chữ, hiệu ứng, cấu hình, liên kết và dữ liệu không được chọn vẫn được giữ khi sửa trường. Trường HTML, bố cục nâng cao, thay đổi preset mặc định và quản lý hệ thống dùng giao diện CMS. Danh sách trường sửa qua MCP hiện ưu tiên trường văn bản và media; Hillbrook lọc theo từng bố cục đã mapping.

Trong **Nội dung trang → Chỉnh sửa**, bản nháp Agent có mục **Bản nháp Agent**. Mở xem trước, kiểm tra bản so sánh và xác nhận duyệt khi sẵn sàng xuất bản. Nếu có thay đổi sau khi gửi duyệt, Agent gửi lại revision. Nhật ký dùng bảng hoạt động CMS với danh tính Agent, thao tác, thay đổi và người duyệt.

## Kiểm thử và phát hành

Workflow `Verify CMS navigation` chạy kiểm thử HTTP MCP, JWT, quyền, sao chép, media, preset, chống ghi đè, xuất bản và nhật ký trên PostgreSQL cô lập. Chạy thêm với mẫu thật bằng cách đặt `CMS_MCP_HILLBROOK_SOURCE` trỏ tới `src/lib/hillbrook-templates.ts` trong checkout web, rồi chạy `node test/cms-mcp.integration.cjs` sau khi đã tạo Prisma Client, áp dụng migration vào DB thử và biên dịch TypeScript. Script chỉ chấp nhận DB thử loopback theo cấu hình test.

Build API và web bằng GitHub Actions trên `ubuntu-latest`. Bản build theo commit giữ mặc định `publish_production=false`. Khi được duyệt triển khai, xác minh riêng hai digest hiện chạy, đưa API lên trước để áp dụng migration bổ sung, kiểm tra API, rồi nhận image web có nút duyệt. Cấu hình OAuth và định tuyến chỉ `/mcp` cùng metadata qua HTTPS theo phạm vi được duyệt. Bật quyền đọc trước, kiểm chứng bằng client đã đăng ký, sau đó cấp quyền tạo nháp và gửi duyệt nếu cần.

Có thể tắt MCP bằng cờ cấu hình và vẫn duyệt các bản nháp đã gửi qua CMS. Giữ migration bổ sung khi quay lui. Trước khi quay về image API cũ, xử lý các bản nháp Agent còn chờ duyệt để quyền xuất bản thông thường của phiên bản cũ không thay thế cơ chế bảo vệ mới.
