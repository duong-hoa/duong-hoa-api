# Nguyên tắc phát triển CMS Dương Hòa

- Giữ tương thích với nghiệp vụ và dữ liệu CMS gốc của block, trang và blog. Mở rộng trên luồng API, mô hình dữ liệu và phân quyền hiện có; không tạo luồng tắt bỏ qua logic hệ thống.
- Với mỗi chức năng hoặc trường mới, rà soát toàn bộ mapping giữa biểu mẫu CMS, API, dữ liệu lưu trữ, đa ngôn ngữ, xem trước, nhân bản/mẫu trang và frontend. Bảo toàn dữ liệu cũ và kiểm tra trường hợp chưa cấu hình.
- Các mẫu mới cần được xem và duyệt trên local trước khi tích hợp hoặc đưa lên môi trường online. Không tự xuất bản nội dung minh họa lên trang thật.
- Kiểm tra migration và nghiệp vụ trên cơ sở dữ liệu thử cô lập, sau đó xác minh CMS và giao diện thực tế khi triển khai. Quy tắc giao diện và kiểm thử frontend nằm tại `duong-hoa-web/AGENTS.md` trong dự án Dương Hòa.
