# clipBo

clipBo is an open-source desktop app that helps you work faster with text and screenshots using AI.

You can highlight text in any app, open clipBo with a hotkey, and run quick actions like translation, rewriting, or asking AI for help. You can also ask questions about screenshots by pasting an image or selecting a screen region.

## Why People Use clipBo
- Quick AI help without switching tabs.
- Reusable custom actions for repeated tasks.
- Works across apps with global popup shortcuts.
- Supports multiple AI providers (Gemini, OpenAI-compatible, Ollama).

## What You Can Do
- Open a smart action popup from anywhere.
- Run built-in actions (`AI Prompt`, `Ask by Image`).
- Create your own custom smart actions.
- Continue responses in chat mode when needed.
- Paste the latest AI reply back into your current app.

## About & Contact
- Author: **Triết Bùi**
- GitHub: [bmtriet/clipBo](https://github.com/bmtriet/clipBo)
- Facebook: [fb.me/trietbui89](https://fb.me/trietbui89)
- Email: [minhtrietbui@live.com](mailto:minhtrietbui@live.com)

You can also use the `About` button inside the app to contact or contribute.

## Install / Run (for contributors)
If you want to run clipBo from source:

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

To build desktop packages:

```bash
cd webui
npm run tauri:build
```

## Permissions (macOS)
clipBo may ask for:
- **Accessibility** (for text copy/paste workflow)
- **Screen Recording** (for screenshot region selection)

These are required for full functionality.

## Open Source
Contributions are welcome.

If you find a bug, have an idea, or want to improve UX, please open an issue or pull request:
[https://github.com/bmtriet/clipBo](https://github.com/bmtriet/clipBo)
