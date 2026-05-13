# KoDauKoVui

**KoDauKoVui** là một công cụ tiện ích hỗ trợ AI mạnh mẽ (sử dụng OpenAI hoặc Google Gemini) chạy ngầm trên máy tính, giúp bạn thao tác văn bản nhanh chóng bằng các phím tắt (hotkeys).
Ứng dụng có giao diện Web UI hiện đại được xây dựng bằng React, Vite và TailwindCSS, hiển thị mượt mà trên desktop thông qua `pywebview`.

## Tính năng chính
- **Thêm dấu tiếng Việt**: Tự động sửa lỗi và thêm dấu chuẩn xác cho đoạn văn bản tiếng Việt. Hỗ trợ hệ thống học (Learning Mode) từ những lần sửa của người dùng.
- **Dịch thuật đa ngôn ngữ**: Dịch đoạn văn bản được chọn sang Tiếng Anh, Tiếng Hoa Phồn thể, Tiếng Khmer hoặc Tiếng Việt.
- **Hỏi đáp AI (Prompt)**: Hiện khung giao diện tiện lợi để nhập câu hỏi/yêu cầu trực tiếp cho AI và nhận câu trả lời vào clipboard.
- **Giao diện Popup trực quan**: Giao diện UI chọn chức năng (1-6) hiện đại, nhẹ nhàng thay vì phải nhớ quá nhiều phím tắt.
- **Chèn trực tiếp (Auto-Paste)**: Tự động copy đoạn văn bôi đen, xử lý, và dán trả lại vào vị trí cũ.

## Yêu cầu hệ thống
- Python 3.10 trở lên
- Node.js & npm (để phát triển/build UI React)
- Môi trường Linux (với X11) hoặc Windows. Trên Linux yêu cầu xclip.

## Cài đặt và Chạy ứng dụng

### Cách 1: Sử dụng script `run.sh` (Khuyên dùng)
Script `run.sh` sẽ tự động tạo môi trường ảo (virtual environment), cài đặt các gói cần thiết và khởi chạy ứng dụng.
```bash
chmod +x run.sh
./run.sh
```

### Cách 2: Cài đặt thủ công
1. **Tạo môi trường ảo và cài đặt thư viện Python**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Thiết lập API Keys**:
   Tạo file `.env` từ `.env.example` và điền API Keys của bạn:
   ```bash
   cp .env.example .env
   ```
   Cập nhật `GEMINI_API_KEY` hoặc `OPENAI_API_KEY` tương ứng bên trong file `.env`.

3. **Chạy ứng dụng**:
   ```bash
   python3 main.py
   ```

## Xây dựng lại Web UI (Dành cho Developer)
Giao diện popup và hộp thoại hỏi đáp nằm trong thư mục `webui/`. Nếu bạn muốn tùy chỉnh giao diện React, hãy thực hiện các bước sau:
```bash
cd webui
npm install
npm run build
```
Sau khi build, thư mục `webui/dist/` sẽ chứa các file HTML/JS/CSS tĩnh, Python (`webview_host.py`) sẽ tự động tải giao diện mới từ đây.

## Cấu hình Phím Tắt (Hotkeys) mặc định
- Thêm dấu tiếng Việt : `<ctrl>+<f1>`
- Dịch sang Tiếng Anh : `<ctrl>+<f2>`
- Dịch sang Tiếng Hoa : `<ctrl>+<f3>`
- Dịch sang Tiếng Việt : `<ctrl>+<f4>`
- Dịch sang Tiếng Khmer: `<ctrl>+<f5>`
- Hỏi đáp thông minh AI: `<ctrl>+<f12>`
- Bật Menu Popup        : `<ctrl>+.`

*Lưu ý: Các phím tắt này có thể được tùy chỉnh ngay bên trong màn hình Console của ứng dụng (Phím `4`).*
