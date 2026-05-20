# Changelog

## v0.3.2 — 2026-05-20

### Added
- **Linux (Ubuntu) release**: AppImage + .deb packages via Tauri bundle. Full X11 native integration — no `xdotool` dependency.
- `build_linux.sh` — one-command Linux build script with dependency checks and artifact summary.
- Linux `.desktop` file and 256x256 icon for app launcher integration.
- X11 native window management: `XGetInputFocus`, `XGetGeometry`, `XSetInputFocus`, `XTestFakeKeyEvent` replace all `xdotool` shell-outs.

### Changed
- Hotkey registration now normalizes single-character keys to **lowercase** — eliminates CapsLock-dependent behavior on Linux (X11 keysyms are case-sensitive).
- Linux prerequisites simplified: removed `libxdo-dev` and `xdotool` apt dependencies.
- `RunEvent::Reopen` migrated to `RunEvent::Opened` for Tauri v2.11.x compatibility.

### Fixed
- **Linux popup focus**: after showing, popup window now explicitly requests X11 input focus via `XSetInputFocus` — keyboard input reaches the popup immediately.
- Icon set updated: added 256x256 PNG required for Linux AppImage bundle.

---

### Changed
- **Response dialog merged into AI Chat**: when paste is not possible, result opens in Chat with loading animation instead of a static dialog. User can continue the conversation, refine results, and copy.
- Hotkey now toggles popup (close if open, open if closed) — no more "channel closed" errors on double-press.
- Setting renamed: `"Open chat when paste is not possible"` (was "Show result dialog when copy succeeds").

### Fixed
- Insert Latest Reply clipboard crash fixed: replaced fragile AppleScript paste flow with simple clipboard copy.
- Clipboard no longer overwritten when result is shown in Chat (no editable zone).
- Error dialog now shows user-facing messages when translate/smart-action silently fails.
- Loading UX: Chat shows animated dots while waiting for AI response.

---

## v0.3.0 — 2026-05-19

### Added
- Translate feature fix: reused cached selected text instead of re-copying after popup close, preventing silent empty-text errors.
- Ask dialog text context preview: shows selected text snippet with line count, file icon, and Clear context button.
- Auto-close chat dialog after inserting latest reply (400ms delay with success feedback).
- Full i18n coverage for all new UI strings (EN/VI/ZH).
- Automated test suite: 57 React component tests (Vitest) + 7 Rust unit tests (Cargo).
- `test.sh` script to run both frontend and backend tests.
- `run.sh` auto-kills stale Vite process on port 5173 before starting.

### Fixed
- AI Prompt dialog `Image context is loading...` placeholder replaced with adaptive text/image context panel.
- Vite port mismatch: added `--strictPort` to prevent silent fallback when devUrl port is taken.
- Popup blank/white window caused by stale Vite process on port 5173.

---

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
