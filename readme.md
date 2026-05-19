# KoDauKoVui

KoDauKoVui là desktop app React/Vite + Tauri/Rust để xử lý selected text và hình ảnh bằng AI. Runtime Python đã được gỡ bỏ; app hiện chạy bằng Rust backend trong Tauri.

## Tính năng chính
- Popup hotkey toàn cục để chọn smart action.
- Icon `About` ngay trên popup để mở thông tin tác giả và kênh liên lạc/contribute.
- Smart Action CRUD trong Settings.
- Built-in `AI Prompt` và `Ask by Image`, hỗ trợ one-shot hoặc chat tiếp trên cùng context.
- Rust AI runtime cho Gemini, OpenAI-compatible API, và Ollama.
- Rust clipboard/pasteback và macOS ROI capture qua native `screencapture`.
- Tự import cấu hình cũ lần đầu từ `.env`, `smart_actions.json`, `brain.md`, `history.json` nếu các file đó còn ở repo root.

## Tác giả & liên hệ
- Tác giả: **Triết Bùi**
- GitHub: [bmtriet/kodaukovui](https://github.com/bmtriet/kodaukovui)
- Facebook: [fb.me/trietbui89](https://fb.me/trietbui89)
- Email: [minhtrietbui@live.com](mailto:minhtrietbui@live.com)

## Chạy dev

```bash
chmod +x run.sh
./run.sh
```

Hoặc chạy trực tiếp:

```bash
. "$HOME/.cargo/env"
cd webui
npm install
npm run tauri:dev
```

Build app:

```bash
cd webui
npm run tauri:build
```

## Ubuntu/Linux prerequisites
Tauri v2 dev build trên Linux cần `pkg-config`, GTK 3, WebKitGTK 4.1, Soup 3, và các gói build liên quan. Trên Ubuntu:

```bash
sudo apt update
sudo apt install -y \
  pkg-config \
  libglib2.0-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  xdotool \
  gnome-screenshot
```

Repo này đã tắt feature Tauri `dbus` mặc định vì app không dùng tray trên Linux. Nếu bạn gặp lỗi kiểu `libdbus-sys` / `dbus-1.pc`, hãy cập nhật code hiện tại rồi chạy lại `./run.sh`.

Khuyến nghị chạy bằng **Ubuntu on Xorg** thay vì Wayland nếu cần copy selected text và pasteback ổn định, vì app dùng `xdotool` để gửi `Ctrl+C`/`Ctrl+V` và restore cửa sổ đích.

`Ask by Image` trên Linux cần một trong các tool capture vùng màn hình sau:
- `gnome-screenshot` khuyến nghị cho Ubuntu GNOME.
- `flameshot`.
- `grim` + `slurp` cho Wayland/sway/wlroots.
- `scrot` cho X11.

## macOS permissions
- Accessibility: cần cho copy selected text và pasteback bằng phím tắt hệ thống.
- Screen Recording: cần cho `Ask by Image` khi chọn vùng màn hình.

Khi thiếu quyền, app sẽ mở đúng trang **System Settings -> Privacy & Security**. Với Tauri packaged app, app xuất hiện dưới identity KoDauKoVui thay vì `Python`.

## Cấu hình runtime
Rust lưu cấu hình mới trong app data directory của Tauri:
- `settings.json`
- `smart_actions.json`
- `builtin_actions.json`
- `brain.md`
- `history.json`

Các file cũ ở repo root chỉ được dùng để import lần đầu, không còn là runtime chính.

## Default actions
- `1` -> `Thêm dấu tiếng Việt`
- `e` -> `Translate to English`
- `v` -> `Translate to Vietnamese`
- `z` -> `Translate to Traditional Chinese`
- `k` -> `Translate to Khmer`
- `a` -> `AI Prompt`
- `i` -> `Ask by Image`

## Kiểm tra

```bash
cd webui
npm run build
cd src-tauri
cargo test
cargo check
```
