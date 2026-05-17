# KoDauKoVui

**KoDauKoVui** là một công cụ desktop chạy ngầm để xử lý văn bản được chọn bằng AI. App dùng một popup hotkey chung, sau đó cho bạn chọn **smart action** theo key hoặc click. Popup và Settings UI được render bằng React + `pywebview`.

## Tính năng chính
- **Smart Action CRUD**: tạo, sửa, xóa, sắp xếp lại các action ngay trong Settings UI.
- **Popup keyword flow**: mở popup bằng một hotkey toàn cục, rồi bấm key của action ngay trong popup.
- **Prompt riêng cho từng action**: mỗi action có prompt riêng, có thể chỉnh trực tiếp bằng dialog.
- **Ask before run**: từng action có thể bật thêm bước nhập yêu cầu bổ sung trước khi chạy.
- **Return with source**: từng action có thể trả kết quả kèm nguyên văn source ở dưới.
- **Auto-paste**: copy đoạn bôi đen, xử lý, rồi dán trả lại vào đúng chỗ cũ.
- **Built-in AI actions**: `AI Prompt` và `Ask by Image` có thể chạy one-shot hoặc mở chat dialog để tiếp tục trao đổi trên cùng context.
- **Settings UI**: cấu hình provider, popup hotkey, debug log và toàn bộ smart action không cần TUI terminal.

## Cấu trúc cấu hình mới
- `.env`: chỉ giữ cấu hình chung và provider.
- `smart_actions.json`: danh sách smart action runtime do user CRUD, được tạo tự động ở lần chạy đầu tiên.
- `smart_actions.example.json`: file mẫu đi kèm repo/bundle để tham khảo hoặc portable setup.
- `brain.md`: context nền được prepend vào mọi smart action prompt nếu file này tồn tại.
- built-in action `AI Prompt` và `Ask by Image` là action runtime cố định, không nằm trong `smart_actions.json`

## Yêu cầu hệ thống
- Python 3.10-3.13
- Node.js và npm
- Linux (X11), macOS hoặc Windows
- Linux cần `xclip`; nếu muốn restore focus và popup theo vị trí chuột thì cần `xdotool`
- macOS cần cấp quyền Accessibility cho Terminal/app chạy KoDauKoVui để global hotkey, copy/paste và auto-paste hoạt động
- Windows hiện nên tránh Python 3.14 vì `pywebview` kéo `pythonnet`, và `pythonnet` hiện hỗ trợ `Python < 3.14`

## Cài đặt và chạy

### Linux
```bash
chmod +x run.sh
./run.sh
```

### macOS
```bash
chmod +x run.sh
./run.sh
```

Lần đầu chạy trên macOS, vào **System Settings → Privacy & Security → Accessibility** và bật quyền cho Terminal/iTerm hoặc app packaged. Hotkey popup mặc định `<ctrl>+'` sẽ được tự map thành `<cmd>+'` trên macOS.

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
Lần chạy đầu tiên app sẽ tạo `smart_actions.json` với 5 action seed:
- `1` -> `Thêm dấu tiếng Việt`
- `e` -> `Translate to English`
- `v` -> `Translate to Vietnamese`
- `z` -> `Translate to Traditional Chinese`
- `k` -> `Translate to Khmer`

Ngoài ra popup luôn có thêm built-in action:
- `a` -> `AI Prompt`
- `i` -> `Ask by Image`

User-defined smart action có thể sửa, xóa, đổi thứ tự hoặc thay hotkey trong Settings UI.
Hai built-in action không bị xóa, nhưng hotkey của chúng có thể đổi trong Settings UI.

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
- macOS: hiện chạy bằng source qua `run.sh`; packaging `.app`/`.dmg` sẽ cần bổ sung script build riêng

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
- Hotkey của built-in `AI Prompt` và `Ask by Image` cũng là popup-local
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
- Với built-in `AI Prompt` và `Ask by Image`:
  - ask dialog có selector cách phản hồi:
    - `Paste back`: xử lý một chiều rồi paste về active input như cũ
    - `Open chat`: mở chat dialog để tiếp tục thảo luận trên cùng context
  - ask/chat input trong Linux webview dùng `Ctrl+Enter` để submit, còn `Enter` chỉ xuống dòng
- Với built-in image action `Ask by Image`:
  - app ưu tiên lấy ảnh từ clipboard
  - nếu clipboard không có ảnh thì app chụp monitor hiện tại, mở fullscreen fake screen trên đúng monitor đó, rồi cho user drag ROI trực tiếp trên ảnh chụp
  - sau khi có ảnh, app luôn mở ask dialog để lấy câu hỏi
  - nếu chọn chat mode, mọi follow-up sẽ tiếp tục dùng đúng ảnh đã capture ở turn đầu
- Với built-in `AI Prompt`:
  - app dùng selected text làm context nền cho cả one-shot lẫn chat mode
  - nếu chọn chat mode, follow-up sẽ tiếp tục bám theo đoạn selected text đã lấy ở turn đầu
