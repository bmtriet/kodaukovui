# ClipBo

<p align="center">
  <strong>Open-source AI Smart Actions for clipboard, selected text, and screenshots.</strong>
</p>

<p align="center">
  <a href="#english">English</a> ·
  <a href="#vietnamese">Tiếng Việt</a> ·
  <a href="#chinese">中文</a>
</p>

---

<a id="english"></a>
## English

**ClipBo** is a free and open-source desktop app that turns your clipboard, selected text, and screenshots into instant AI actions.

Built with **React / Vite + Tauri / Rust**.

### Screenshots
![ClipBo Overview](screenshots/overview.png)
![Popup](screenshots/popup.png)
![Settings](screenshots/settings.png)
![Ask Prompt](screenshots/ask.png)
![Chat](screenshots/chat.png)
![Ask by Image](screenshots/image-source.png)

### Features
- Global AI action popup
- Smart Action CRUD
- AI Prompt (one-shot + chat)
- Ask by Image (clipboard image + ROI capture)
- Gemini / OpenAI-compatible / Ollama
- Clipboard copy & pasteback
- macOS permissions flow
- Multilingual defaults (EN/VI/ZH)

### Development
```bash
chmod +x run.sh
./run.sh
```

Or:

```bash
. "$HOME/.cargo/env"
cd webui
npm install
npm run tauri:dev
```

Build:

```bash
cd webui
npm run tauri:build
```

### License
MIT License.

---

<a id="vietnamese"></a>
## Tiếng Việt

**ClipBo** là app desktop miễn phí, mã nguồn mở, giúp biến clipboard, selected text và screenshot thành AI Smart Actions dùng ngay bằng hotkey.

Xây dựng với **React / Vite + Tauri / Rust**.

### Tính năng
- Popup action toàn cục
- CRUD Smart Action
- AI Prompt (một lần + chat tiếp)
- Ask by Image (ảnh clipboard + ROI)
- Hỗ trợ Gemini / OpenAI-compatible / Ollama
- Copy / pasteback về app đích
- Luồng quyền macOS
- Action mặc định đa ngôn ngữ (EN/VI/ZH)

### Chạy dev
```bash
chmod +x run.sh
./run.sh
```

Hoặc:

```bash
. "$HOME/.cargo/env"
cd webui
npm install
npm run tauri:dev
```

Build:

```bash
cd webui
npm run tauri:build
```

### License
MIT License.

---

<a id="chinese"></a>
## 中文

**ClipBo** 是一个免费开源桌面应用，可将剪贴板、选中文本与截图快速转换为 AI Smart Actions。

基于 **React / Vite + Tauri / Rust** 构建。

### 功能
- 全局 AI 弹窗
- Smart Action 增删改查
- AI Prompt（单轮 + 连续聊天）
- Ask by Image（剪贴板图片 + 区域截图）
- 支持 Gemini / OpenAI-compatible / Ollama
- 剪贴板复制与粘贴回填
- macOS 权限流程
- 多语言默认动作（EN/VI/ZH）

### 开发
```bash
chmod +x run.sh
./run.sh
```

或：

```bash
. "$HOME/.cargo/env"
cd webui
npm install
npm run tauri:dev
```

Build:

```bash
cd webui
npm run tauri:build
```

### License
MIT License.
