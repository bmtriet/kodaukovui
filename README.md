# clipBo

Ngôn ngữ: **Tiếng Việt** | [English](#english) | [繁體中文](#zh-tw)

clipBo là ứng dụng desktop mã nguồn mở giúp bạn xử lý văn bản và ảnh chụp màn hình nhanh hơn với AI.

Bạn có thể bôi đen text ở bất kỳ ứng dụng nào, mở clipBo bằng hotkey và chạy các tác vụ nhanh như dịch, viết lại nội dung, hoặc hỏi AI. Với hình ảnh, bạn có thể hỏi từ ảnh clipboard hoặc khoanh vùng ROI trên màn hình.

## Vì sao dùng clipBo
- Gọi AI nhanh, không phải chuyển tab liên tục.
- Tạo và tái sử dụng smart action theo nhu cầu riêng.
- Hoạt động xuyên ứng dụng với popup hotkey toàn cục.
- Hỗ trợ nhiều provider AI (Gemini, OpenAI-compatible, Ollama).

## Tính năng chính
- Mở popup smart action từ mọi nơi.
- Dùng built-in action (`AI Prompt`, `Ask by Image`).
- Tạo custom smart action của riêng bạn.
- Tiếp tục trao đổi trong cửa sổ chat khi cần.
- Copy phản hồi AI mới nhất để dán vào ứng dụng đang dùng.

## Liên hệ & đóng góp
- Tác giả: **Triết Bùi**
- GitHub: [bmtriet/clipBo](https://github.com/bmtriet/clipBo)
- Facebook: [fb.me/trietbui89](https://fb.me/trietbui89)
- Email: [minhtrietbui@live.com](mailto:minhtrietbui@live.com)

Bạn cũng có thể mở nút `About` trong app để liên hệ hoặc tham gia đóng góp.

## Cài đặt / chạy từ source
```bash
chmod +x run.sh
./run.sh
```

Hoặc:

```bash
cd webui
npm install
npm run tauri:dev
```

Build bản desktop:

```bash
cd webui
npm run tauri:build
```

## Quyền trên macOS
clipBo có thể yêu cầu:
- **Accessibility** (phục vụ luồng copy/paste văn bản)
- **Screen Recording** (phục vụ chụp vùng màn hình)

Các quyền này cần thiết để app hoạt động đầy đủ.

## Mã nguồn mở
Mọi đóng góp đều được chào đón.

Nếu bạn gặp lỗi, có ý tưởng mới, hoặc muốn cải thiện UX, hãy tạo issue hoặc pull request:
[https://github.com/bmtriet/clipBo](https://github.com/bmtriet/clipBo)

---

## English

Language: [Tiếng Việt](#clipbo) | **English** | [繁體中文](#zh-tw)

clipBo is an open-source desktop app that helps you work faster with text and screenshots using AI.

You can highlight text in any app, open clipBo with a hotkey, and run quick actions like translation, rewriting, or asking AI for help. You can also ask questions about screenshots by using a clipboard image or selecting a screen region.

### Why People Use clipBo
- Quick AI help without switching tabs.
- Reusable custom actions for repeated tasks.
- Works across apps with global popup shortcuts.
- Supports multiple AI providers (Gemini, OpenAI-compatible, Ollama).

### What You Can Do
- Open a smart action popup from anywhere.
- Run built-in actions (`AI Prompt`, `Ask by Image`).
- Create your own custom smart actions.
- Continue responses in chat mode when needed.
- Copy the latest AI reply and paste it into your current app.

### About & Contact
- Author: **Triết Bùi**
- GitHub: [bmtriet/clipBo](https://github.com/bmtriet/clipBo)
- Facebook: [fb.me/trietbui89](https://fb.me/trietbui89)
- Email: [minhtrietbui@live.com](mailto:minhtrietbui@live.com)

### Install / Run (from source)
```bash
chmod +x run.sh
./run.sh
```

Or:

```bash
cd webui
npm install
npm run tauri:dev
```

Build desktop packages:

```bash
cd webui
npm run tauri:build
```

### Permissions (macOS)
clipBo may ask for:
- **Accessibility** (for text copy/paste workflow)
- **Screen Recording** (for screenshot region selection)

These are required for full functionality.

---

## Zh-TW

語言：[Tiếng Việt](#clipbo) | [English](#english) | **繁體中文**

clipBo 是一款開源桌面應用，透過 AI 協助你更快速處理文字與螢幕截圖。

你可以在任何應用中選取文字，用快捷鍵開啟 clipBo，快速執行翻譯、改寫或 AI 問答。針對圖片，你也可以直接使用剪貼簿圖片，或框選螢幕區域進行提問。

### 為什麼使用 clipBo
- 不用頻繁切換分頁，也能快速取得 AI 協助。
- 可重複使用自訂 smart action。
- 透過全域快捷鍵在各種應用中使用。
- 支援多種 AI provider（Gemini、OpenAI-compatible、Ollama）。

### 主要功能
- 隨時開啟 smart action 彈窗。
- 使用內建動作（`AI Prompt`、`Ask by Image`）。
- 建立你自己的 custom smart action。
- 需要時可在聊天視窗延續對話。
- 複製最新 AI 回覆並貼回目前使用中的應用。

### 聯絡與貢獻
- 作者：**Triết Bùi**
- GitHub: [bmtriet/clipBo](https://github.com/bmtriet/clipBo)
- Facebook: [fb.me/trietbui89](https://fb.me/trietbui89)
- Email: [minhtrietbui@live.com](mailto:minhtrietbui@live.com)

### 從原始碼執行
```bash
chmod +x run.sh
./run.sh
```

或：

```bash
cd webui
npm install
npm run tauri:dev
```

打包桌面版本：

```bash
cd webui
npm run tauri:build
```
