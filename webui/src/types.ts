export type PageKind = "ask" | "popup" | "settings" | "chat" | "image_source" | "response"
export type UiLanguage = "en" | "vi" | "zh"
export type ResponseMode = "paste" | "chat"
export type BuiltinKind = "ai_prompt" | "image_ask"
export type LauncherCategory = "translate" | "ai" | "text" | "image" | "other"
export type LauncherRunMode = "direct" | "prompt" | "config"
export type PopupSectionId = "quick_translate" | "ai_tools" | "text_tools" | "other_actions"

export type GeneralSettings = {
  AI_PROVIDER: "gemini" | "openai" | "ollama"
  GEMINI_API_KEY: string
  GEMINI_MODEL: string
  OPENAI_API_KEY: string
  OPENAI_MODEL: string
  OPENAI_API_BASE: string
  OLLAMA_MODEL: string
  OLLAMA_THINKING: boolean
  OLLAMA_API_BASE: string
  HOTKEY_POPUP: string
  UI_LANGUAGE: UiLanguage
  DEBUG: boolean
  SHOW_RESPONSE_DIALOG_WHEN_NO_INPUT: boolean
}

export type SmartAction = {
  id: string
  name: string
  prompt: string
  hotkey: string
  return_with_source: boolean
  ask_before_run: boolean
  enabled: boolean
}

export type BuiltinAction = {
  id: string
  name: string
  hotkey: string
  kind: BuiltinKind
  enabled: boolean
}

export type SettingsSnapshot = {
  settings: GeneralSettings
  smart_actions: SmartAction[]
  builtin_actions: BuiltinAction[]
}

export type SaveSnapshotResponse = {
  ok: boolean
  error?: string
  smart_actions?: SmartAction[]
  builtin_actions?: BuiltinAction[]
}

export type AskPayload = {
  title?: string
  placeholder?: string
  responseModeEnabled?: boolean
  defaultResponseMode?: ResponseMode
  contextMode?: "selected_text" | "prompt_only"
  imageContextAvailable?: boolean
  selectedText?: string
}

export type ImageSourcePayload = {
  title?: string
}

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type ChatSession = {
  kind: BuiltinKind
  title: string
  messages: ChatMessage[]
  latest_reply: string
  context_hint?: string
  selected_text?: string
  image_payload?: ImagePayload
  initial_user_prompt?: string
  target_window_id?: string
}

export type ImagePayload = {
  source?: string
  mime_type?: string
  image_base64?: string
  size?: { width: number; height: number }
  region?: { left: number; top: number; right: number; bottom: number }
}

export type ChatApiResponse = {
  ok: boolean
  error?: string
  session?: ChatSession
}

export type PopupContext = {
  has_selected_text: boolean
  has_clipboard_image: boolean
  has_clipboard_text: boolean
}

export type PopupItem = {
  id: string
  label: string
  short_label?: string
  shortcut: string
  category: LauncherCategory
  context_tags: string[]
  priority_base: number
  run_mode: LauncherRunMode
  kind?: BuiltinKind
  is_builtin: boolean
  ask_before_run: boolean
  return_with_source: boolean
}

export type PopupSection = {
  id: PopupSectionId
  items: PopupItem[]
}

export type PopupPayload = {
  context: PopupContext
  sections: PopupSection[]
}

export type DesktopApi = {
  submitAsk: (prompt: string, responseMode?: string, contextCleared?: boolean) => void
  cancelAsk: () => void
  retakeImageForAsk: () => Promise<{ ok: boolean; error?: string }>
  getAskImageContext: () => Promise<{ ok: boolean; error?: string; image_payload?: ImagePayload }>
  submitPopup: (actionId: string) => void
  cancelPopup: () => void
  openSettings: () => void
  setUiLanguage: (lang: string) => void
  getSettingsSnapshot: () => Promise<SettingsSnapshot>
  saveSettingsSnapshot: (payload: string) => Promise<SaveSnapshotResponse>
  closeSettings: (saved: boolean) => void
  getChatState: () => Promise<ChatApiResponse>
  bootstrapChat: () => Promise<ChatApiResponse>
  sendChatMessage: (prompt: string) => Promise<ChatApiResponse>
  insertLatestReply: () => Promise<{ ok: boolean; error?: string }>
  closeChat: () => void
  chooseImageSource: (source: string, doNotAskAgain?: boolean) => void
  cancelImageSource: () => void
  closeResponse: () => void
  copyResponseText: (text: string) => Promise<{ ok: boolean; error?: string }>
}

export const defaultSettings: GeneralSettings = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "gemini-2.5-flash-lite",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_API_BASE: "https://api.openai.com/v1",
  OLLAMA_MODEL: "gemma4:e2b",
  OLLAMA_THINKING: false,
  OLLAMA_API_BASE: "http://127.0.0.1:11434",
  HOTKEY_POPUP: "<ctrl>+'",
  UI_LANGUAGE: "en",
  DEBUG: false,
  SHOW_RESPONSE_DIALOG_WHEN_NO_INPUT: true,
}

export function createActionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `action-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createEmptyAction(): SmartAction {
  return {
    id: createActionId(),
    name: "",
    prompt: "",
    hotkey: "",
    return_with_source: false,
    ask_before_run: false,
    enabled: true,
  }
}

export function getDesktopApi(): DesktopApi | null {
  return window.desktopApi ?? null
}

export function waitForDesktopApi(timeoutMs = 5000): Promise<DesktopApi> {
  const existing = getDesktopApi()
  if (existing?.getSettingsSnapshot) {
    return Promise.resolve(existing)
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const finish = (api: DesktopApi | null) => {
      cleanup()
      if (api?.getSettingsSnapshot) {
        resolve(api)
      } else {
        reject(new Error("desktop api is not ready"))
      }
    }

    const check = () => {
      const api = getDesktopApi()
      if (api?.getSettingsSnapshot) {
        finish(api)
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        finish(null)
      }
    }

    const onReady = () => check()
    const intervalId = window.setInterval(check, 100)

    const cleanup = () => {
      window.clearInterval(intervalId)
      window.removeEventListener("desktopapiready", onReady as EventListener)
    }

    window.addEventListener("desktopapiready", onReady as EventListener)
    check()
  })
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === "input" || tagName === "textarea" || target.isContentEditable
}

export function isImeComposing(event: KeyboardEvent): boolean {
  return Boolean((event as KeyboardEvent & { isComposing?: boolean }).isComposing) || event.key === "Process"
}

export function parsePayload<T extends object>(): T {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get("payload")
  if (!raw) return {} as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return {} as T
  }
}

export function readPageParam(): PageKind {
  const pageParam = new URLSearchParams(window.location.search).get("page")
  if (pageParam === "popup" || pageParam === "settings" || pageParam === "ask" || pageParam === "chat" || pageParam === "image_source" || pageParam === "response") {
    return pageParam
  }
  return "ask"
}

export function readUiLangParam(): UiLanguage {
  const langParam = new URLSearchParams(window.location.search).get("uilang")
  if (langParam === "en" || langParam === "vi" || langParam === "zh") {
    return langParam
  }
  return "en"
}
