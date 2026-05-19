# Changelog

## v0.2-beta — 2026-05-19

### Added
- Response Dialog fallback when pasteback target has no editable field, with Markdown rendering & copy actions.
- Enable/disable toggles for Smart Action & built-in AI actions.
- Settings tabs: General, Actions, Provider, About.
- Ask by Image: thumbnail preview with lightbox & retake screenshot.
- Dock-click toggle for popup on macOS.
- Chat shows user message immediately (before AI reply completes), with correct first-bubble question text.
- Main popup: native title bar, auto-height to visible actions.
- Provider UI filters to active provider only.

### Fixed
- Pasteback fallback no longer silent when target app has no input.
- Take new shot dismisses current Ask by Image before ROI capture.
- Large images no longer routed via URL (avoiding Vite 431 errors).
- Chat first-turn image context preserved alongside cleaner user bubble.

---

## v0.1-beta — 2026-05-19

### Added
- Initial macOS public beta release.
- Popup launcher with quick actions & AI tools.
- Chat with Markdown rendering, copy, copy-plain.
- Ask by Image flow with thumbnail preview in chat.
- Providers: Gemini, OpenAI-compatible, Ollama.
- About dialog with author & contact links.
- Multi-language UI (VN, EN, CN).

### Fixed
- Enter submits / Shift+Enter inserts newline in chat.
- Popup hotkey capture from keyboard in Settings, rebinds immediately on save.
- Active provider & shortcut pill shown in popup.
- Settings window load failure in packaged builds.
- Duplicate Settings dialog from popup.
- Startup permissions no longer re-open Accessibility Settings.
