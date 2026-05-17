# KoDauKoVui

KoDauKoVui là desktop app React/Vite + Tauri/Rust để xử lý selected text và hình ảnh bằng AI. Runtime Python đã được gỡ bỏ; app hiện chạy bằng Rust backend trong Tauri.

## Tính năng chính
- Popup hotkey toàn cục để chọn smart action.
- Smart Action CRUD trong Settings.
- Built-in `AI Prompt` và `Ask by Image`, hỗ trợ one-shot hoặc chat tiếp trên cùng context.
- Rust AI runtime cho Gemini và OpenAI-compatible API.
- Rust clipboard/pasteback và macOS ROI capture qua native `screencapture`.
- Tự import cấu hình cũ lần đầu từ `.env`, `smart_actions.json`, `brain.md`, `history.json` nếu các file đó còn ở repo root.

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
