# KoDauKoVui

**KoDauKoVui** là một công cụ desktop chạy ngầm để xử lý văn bản được chọn bằng AI. App dùng một popup hotkey chung, sau đó cho bạn chọn **smart action** theo key hoặc click. Popup và Settings UI được render bằng React + `pywebview`.

## Tính năng chính
- **Smart Action CRUD**: tạo, sửa, xóa, sắp xếp lại các action ngay trong Settings UI.
- **Popup keyword flow**: mở popup bằng một hotkey toàn cục, rồi bấm key của action ngay trong popup.
- **Prompt riêng cho từng action**: mỗi action có prompt riêng, có thể chỉnh trực tiếp bằng dialog.
- **Ask before run**: từng action có thể bật thêm bước nhập yêu cầu bổ sung trước khi chạy.
- **Return with source**: từng action có thể trả kết quả kèm nguyên văn source ở dưới.
- **Auto-paste**: copy đoạn bôi đen, xử lý, rồi dán trả lại vào đúng chỗ cũ.
- **Settings UI**: cấu hình provider, popup hotkey, debug log và toàn bộ smart action không cần TUI terminal.

## Cấu trúc cấu hình mới
- `.env`: chỉ giữ cấu hình chung và provider.
- `smart_actions.json`: danh sách smart action runtime, được tạo tự động ở lần chạy đầu tiên.
- `smart_actions.example.json`: file mẫu đi kèm repo/bundle để tham khảo hoặc portable setup.
- `brain.md`: context nền được prepend vào mọi smart action prompt nếu file này tồn tại.

## Yêu cầu hệ thống
- Python 3.10-3.13
- Node.js và npm
- Linux (X11) hoặc Windows
- Linux cần `xclip`; nếu muốn restore focus và popup theo vị trí chuột thì cần `xdotool`
- Windows hiện nên tránh Python 3.14 vì `pywebview` kéo `pythonnet`, và `pythonnet` hiện hỗ trợ `Python < 3.14`

## Cài đặt và chạy

### Linux
```bash
chmod +x run.sh
./run.sh
```

### Chạy tay
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-linux.txt
cp .env.example .env
python3 main.py
```

### Windows
```powershell
run_windows.bat
```

Sau khi app chạy:
- terminal chỉ hiển thị log cơ bản
- bấm `Ctrl+'` để mở popup
- bấm gear để mở Settings UI

## Smart action mặc định
Lần chạy đầu tiên app sẽ tạo `smart_actions.json` với 6 action seed:
- `1` -> `Thêm dấu tiếng Việt`
- `e` -> `Translate to English`
- `v` -> `Translate to Vietnamese`
- `z` -> `Translate to Traditional Chinese`
- `k` -> `Translate to Khmer`
- `a` -> `AI Prompt` (`ask_before_run=true`)

Tất cả action này đều có thể sửa, xóa, đổi thứ tự hoặc thay hotkey trong Settings UI.

## Packaging đa nền tảng
- Build Windows phải chạy trên Windows:
  ```powershell
  build_windows.bat
  ```
- Build Linux phải chạy trên Linux:
  ```bash
  ./build_linux.sh
  ```

Artifact:
- Windows: `dist/KoDauKoVui/KoDauKoVui.exe` và `dist/KoDauKoVui-windows-x64.zip`
- Linux: `dist/kodaukovui/kodaukovui` và `dist/KoDauKoVui-linux-x64.tar.gz`

Bundle packaged app sẽ mang theo:
- `webui/dist/`
- `icons/`
- `.env.example`
- `brain.md`
- `smart_actions.example.json`

Runtime writable files vẫn nằm cạnh executable/script:
- `.env`
- `smart_actions.json`
- `history.json`
- `learned.json`

## Ghi chú hành vi
- Chỉ có **một** global hotkey: `HOTKEY_POPUP`
- Hotkey của từng smart action là **popup-local**, không phải global hotkey riêng
- Mọi smart action đều chạy qua cùng một pipeline:
  - nạp `brain.md`
  - nạp prompt của action
  - nếu bật `ask_before_run`, mở dialog để lấy yêu cầu bổ sung
  - append selected text
  - gửi qua provider hiện tại
- Nếu bật `return_with_source`, output format là:
  ```text
  <result>

  ---
  Source:
  <original text>
  ```
