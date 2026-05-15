import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronRight,
  Image,
  Keyboard,
  Pencil,
  Plus,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

declare global {
  interface Window {
    pywebview?: {
      api: {
        submitAsk: (prompt: string, responseMode?: string) => void
        cancelAsk: () => void
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
      }
    }
  }
}

type PywebviewApi = NonNullable<NonNullable<typeof window.pywebview>["api"]>
type PageKind = "ask" | "popup" | "settings" | "chat"
type UiLanguage = "en" | "vi" | "zh"
type ResponseMode = "paste" | "chat"
type BuiltinKind = "ai_prompt" | "image_ask"

type GeneralSettings = {
  AI_PROVIDER: "gemini" | "openai"
  GEMINI_API_KEY: string
  GEMINI_MODEL: string
  OPENAI_API_KEY: string
  OPENAI_MODEL: string
  OPENAI_API_BASE: string
  HOTKEY_POPUP: string
  UI_LANGUAGE: UiLanguage
  DEBUG: boolean
}

type SmartAction = {
  id: string
  name: string
  prompt: string
  hotkey: string
  return_with_source: boolean
  ask_before_run: boolean
}

type BuiltinAction = {
  id: string
  name: string
  hotkey: string
  kind: BuiltinKind
}

type SettingsSnapshot = {
  settings: GeneralSettings
  smart_actions: SmartAction[]
  builtin_actions: BuiltinAction[]
}

type SaveSnapshotResponse = {
  ok: boolean
  error?: string
  smart_actions?: SmartAction[]
  builtin_actions?: BuiltinAction[]
}

type AskPayload = {
  title?: string
  placeholder?: string
  responseModeEnabled?: boolean
  defaultResponseMode?: ResponseMode
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

type ChatSession = {
  kind: BuiltinKind
  title: string
  messages: ChatMessage[]
  latest_reply: string
  context_hint?: string
  selected_text?: string
  image_payload?: {
    source?: string
    mime_type?: string
    size?: { width: number; height: number }
    region?: { left: number; top: number; right: number; bottom: number }
  }
}

type ChatApiResponse = {
  ok: boolean
  error?: string
  session?: ChatSession
}

const defaultSettings: GeneralSettings = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "gemini-2.5-flash-lite",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_API_BASE: "https://api.openai.com/v1",
  HOTKEY_POPUP: "<ctrl>+'",
  UI_LANGUAGE: "en",
  DEBUG: false,
}

const translations = {
  en: {
    askTitle: "Extra Instruction",
    askPlaceholder: "Enter your request...",
    popupTitle: "Smart Actions",
    popupSubtitle: "Press a configured key or click an action",
    popupFooter: "Popup-local hotkeys only work while this popup is open.",
    imageActionHint: "Ask about clipboard image or draw an ROI capture.",
    aiPromptHint: "Ask AI about the currently selected text.",
    settingsTitle: "Settings",
    settingsSubtitle: "General settings, built-ins, and smart actions",
    close: "Close",
    saveAll: "Save All",
    general: "General",
    provider: "Provider",
    smartActions: "Smart Actions",
    builtins: "Built-in Actions",
    popupHotkey: "Global Popup Hotkey",
    uiLanguage: "UI Language",
    debug: "Debug logging",
    providerLabel: "AI Provider",
    geminiKey: "Gemini API Key",
    geminiModel: "Gemini Model",
    openaiKey: "OpenAI API Key",
    openaiModel: "OpenAI Model",
    openaiBase: "OpenAI API Base",
    addAction: "Add Action",
    edit: "Edit",
    delete: "Delete",
    moveUp: "Move Up",
    moveDown: "Move Down",
    name: "Name",
    prompt: "Prompt",
    hotkey: "Hotkey",
    askBeforeRun: "Ask before run",
    returnWithSource: "Return result with source",
    actionDialogCreate: "Create Smart Action",
    actionDialogEdit: "Edit Smart Action",
    cancel: "Cancel",
    save: "Save",
    submit: "Submit",
    send: "Send",
    insertLatestReply: "Insert Latest Reply",
    responseMode: "Response Mode",
    responsePaste: "Paste back",
    responseChat: "Open chat",
    enterNewLineHint: "Enter inserts a new line. Ctrl+Enter submits.",
    actionsHint: "Each user action has its own prompt, popup hotkey, and source-return option.",
    builtinHint: "Built-in actions always stay available, but their popup hotkeys can be changed here.",
    duplicateKeys: "All popup hotkeys must be unique.",
    reservedKeys: "Some smart action hotkeys are reserved for built-in actions.",
    singleKey: "Each action hotkey must be exactly one character.",
    requiredName: "Action name is required.",
    requiredPrompt: "Action prompt is required.",
    savedHint: "Changes are applied immediately after saving.",
    loadError: "Failed to load settings snapshot.",
    chatTitle: "AI Chat",
    chatLoading: "Preparing the first reply...",
    chatEmpty: "The chat thread is empty.",
    chatPlaceholder: "Type your next message...",
    chatInsertSuccess: "Latest reply inserted into the active app.",
    chatContextText: "Selected text context",
    chatContextImage: "Image context",
    chatErrorFallback: "Failed to send the message.",
  },
  vi: {
    askTitle: "Yêu cầu bổ sung",
    askPlaceholder: "Nhập yêu cầu của bạn...",
    popupTitle: "Smart Action",
    popupSubtitle: "Bấm key đã cấu hình hoặc click vào action",
    popupFooter: "Popup-local hotkey chỉ có hiệu lực khi popup đang mở.",
    imageActionHint: "Hỏi về ảnh trong clipboard hoặc quét ROI màn hình.",
    aiPromptHint: "Hỏi AI về đoạn văn bản đang được chọn.",
    settingsTitle: "Cài đặt",
    settingsSubtitle: "Cấu hình chung, built-in và smart action",
    close: "Đóng",
    saveAll: "Lưu tất cả",
    general: "Chung",
    provider: "Provider",
    smartActions: "Smart Action",
    builtins: "Built-in Action",
    popupHotkey: "Phím mở popup toàn cục",
    uiLanguage: "Ngôn ngữ UI",
    debug: "Bật debug log",
    providerLabel: "AI Provider",
    geminiKey: "Gemini API Key",
    geminiModel: "Gemini Model",
    openaiKey: "OpenAI API Key",
    openaiModel: "OpenAI Model",
    openaiBase: "OpenAI API Base",
    addAction: "Thêm action",
    edit: "Sửa",
    delete: "Xóa",
    moveUp: "Lên",
    moveDown: "Xuống",
    name: "Tên",
    prompt: "Prompt",
    hotkey: "Hotkey",
    askBeforeRun: "Hỏi thêm trước khi chạy",
    returnWithSource: "Trả kết với Source",
    actionDialogCreate: "Tạo smart action",
    actionDialogEdit: "Sửa smart action",
    cancel: "Hủy",
    save: "Lưu",
    submit: "Gửi",
    send: "Gửi tiếp",
    insertLatestReply: "Chèn reply mới nhất",
    responseMode: "Cách phản hồi",
    responsePaste: "Paste vào app",
    responseChat: "Mở chat",
    enterNewLineHint: "Enter xuống dòng. Ctrl+Enter để gửi.",
    actionsHint: "Mỗi user action có prompt, hotkey trong popup và tùy chọn trả kèm source riêng.",
    builtinHint: "Built-in action luôn có sẵn, nhưng user có thể đổi popup hotkey tại đây.",
    duplicateKeys: "Toàn bộ popup hotkey không được trùng nhau.",
    reservedKeys: "Một số hotkey đã được giữ riêng cho built-in action.",
    singleKey: "Mỗi hotkey phải đúng một ký tự.",
    requiredName: "Tên action là bắt buộc.",
    requiredPrompt: "Prompt action là bắt buộc.",
    savedHint: "Lưu xong áp dụng ngay, không cần restart.",
    loadError: "Không tải được cấu hình hiện tại.",
    chatTitle: "AI Chat",
    chatLoading: "Đang tạo phản hồi đầu tiên...",
    chatEmpty: "Thread chat hiện đang trống.",
    chatPlaceholder: "Nhập tin nhắn tiếp theo...",
    chatInsertSuccess: "Đã chèn phản hồi mới nhất vào app đang dùng.",
    chatContextText: "Ngữ cảnh từ selected text",
    chatContextImage: "Ngữ cảnh từ hình ảnh",
    chatErrorFallback: "Không gửi được tin nhắn.",
  },
  zh: {
    askTitle: "附加要求",
    askPlaceholder: "输入你的要求...",
    popupTitle: "Smart Actions",
    popupSubtitle: "按已配置按键，或点击 action",
    popupFooter: "这些 action 按键只在当前弹窗打开时生效。",
    imageActionHint: "询问剪贴板图片，或框选屏幕区域后提问。",
    aiPromptHint: "围绕当前选中文本向 AI 提问。",
    settingsTitle: "设置",
    settingsSubtitle: "通用设置、内建动作与 smart action",
    close: "关闭",
    saveAll: "全部保存",
    general: "常规",
    provider: "模型提供方",
    smartActions: "Smart Actions",
    builtins: "Built-in Actions",
    popupHotkey: "全局弹窗快捷键",
    uiLanguage: "界面语言",
    debug: "调试日志",
    providerLabel: "AI Provider",
    geminiKey: "Gemini API Key",
    geminiModel: "Gemini Model",
    openaiKey: "OpenAI API Key",
    openaiModel: "OpenAI Model",
    openaiBase: "OpenAI API Base",
    addAction: "新增 action",
    edit: "编辑",
    delete: "删除",
    moveUp: "上移",
    moveDown: "下移",
    name: "名称",
    prompt: "Prompt",
    hotkey: "按键",
    askBeforeRun: "运行前再提问",
    returnWithSource: "返回结果并附原文",
    actionDialogCreate: "创建 smart action",
    actionDialogEdit: "编辑 smart action",
    cancel: "取消",
    save: "保存",
    submit: "提交",
    send: "发送",
    insertLatestReply: "插入最新回复",
    responseMode: "回复方式",
    responsePaste: "回填到应用",
    responseChat: "打开聊天",
    enterNewLineHint: "Enter 换行，Ctrl+Enter 发送。",
    actionsHint: "每个用户 action 都有自己的 prompt、弹窗按键和返回原文选项。",
    builtinHint: "Built-in action 始终可用，但它们的弹窗按键可以在这里修改。",
    duplicateKeys: "所有弹窗按键必须唯一。",
    reservedKeys: "有些按键已保留给内建 action。",
    singleKey: "每个按键必须是单个字符。",
    requiredName: "必须填写 action 名称。",
    requiredPrompt: "必须填写 action prompt。",
    savedHint: "保存后立即生效，无需重启。",
    loadError: "无法加载当前设置。",
    chatTitle: "AI Chat",
    chatLoading: "正在生成第一条回复...",
    chatEmpty: "当前聊天线程为空。",
    chatPlaceholder: "输入下一条消息...",
    chatInsertSuccess: "已将最新回复插入到当前应用。",
    chatContextText: "选中文本上下文",
    chatContextImage: "图像上下文",
    chatErrorFallback: "发送消息失败。",
  },
}

function parsePayload<T extends object>(): T {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get("payload")
  if (!raw) return {} as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return {} as T
  }
}

function createActionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `action-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptyAction(): SmartAction {
  return {
    id: createActionId(),
    name: "",
    prompt: "",
    hotkey: "",
    return_with_source: false,
    ask_before_run: false,
  }
}

function getPywebviewApi(): PywebviewApi | null {
  return window.pywebview?.api ?? null
}

function waitForPywebviewApi(timeoutMs = 5000): Promise<PywebviewApi> {
  const existing = getPywebviewApi()
  if (existing?.getSettingsSnapshot) {
    return Promise.resolve(existing)
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const finish = (api: PywebviewApi | null) => {
      cleanup()
      if (api?.getSettingsSnapshot) {
        resolve(api)
      } else {
        reject(new Error("pywebview api is not ready"))
      }
    }

    const check = () => {
      const api = getPywebviewApi()
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
      window.removeEventListener("pywebviewready", onReady as EventListener)
    }

    window.addEventListener("pywebviewready", onReady as EventListener)
    check()
  })
}

function InputField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200 ${props.className || ""}`}
    />
  )
}

function ToggleField({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-teal-500" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  )
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {icon}
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function LanguagePills({
  currentLang,
  onChange,
}: {
  currentLang: UiLanguage
  onChange: (lang: UiLanguage) => void
}) {
  return (
    <div className="flex gap-1 rounded-md bg-slate-200/60 p-0.5">
      {(["en", "vi", "zh"] as UiLanguage[]).map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          className={`rounded px-2 py-1 text-[10px] font-bold transition ${
            currentLang === lang ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {lang === "en" ? "🇬🇧" : lang === "vi" ? "🇻🇳" : "🇹🇼"}
        </button>
      ))}
    </div>
  )
}

function BuiltinHotkeyEditor({
  action,
  onChange,
}: {
  action: BuiltinAction
  onChange: (next: BuiltinAction) => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 md:grid-cols-[1fr_120px]">
      <div>
        <div className="text-sm font-semibold text-slate-900">{action.name}</div>
        <div className="text-xs text-slate-500">
          {action.kind === "ai_prompt" ? "Reserved built-in AI text discussion flow." : "Reserved built-in image discussion flow."}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Hotkey</label>
        <InputField
          maxLength={1}
          value={action.hotkey}
          onChange={(e) => onChange({ ...action, hotkey: e.target.value.toLowerCase() })}
        />
      </div>
    </div>
  )
}

function AskUi({
  t,
  uiLang,
  changeLang,
}: {
  t: (typeof translations)["en"]
  uiLang: UiLanguage
  changeLang: (newLang: UiLanguage) => void
}) {
  const payload = parsePayload<AskPayload>()
  const [prompt, setPrompt] = useState("")
  const [responseMode, setResponseMode] = useState<ResponseMode>(payload.defaultResponseMode || "paste")
  const [isComposing, setIsComposing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const submit = () => {
    window.pywebview?.api.submitAsk(prompt.trim(), responseMode)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
    const composing = isComposing || Boolean(native.isComposing)

    if (e.key === "Escape" && !composing) {
      e.preventDefault()
      window.pywebview?.api.cancelAsk()
      return
    }

    if (composing) {
      return
    }

    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 p-4 font-sans text-slate-900">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-teal-600" />
            {payload.title || t.askTitle}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={uiLang} onChange={changeLang} />
          <button
            onClick={() => window.pywebview?.api.cancelAsk()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {payload.responseModeEnabled ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.responseMode}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResponseMode("paste")}
              className={`rounded-lg px-3 py-2 text-sm ${responseMode === "paste" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {t.responsePaste}
            </button>
            <button
              type="button"
              onClick={() => setResponseMode("chat")}
              className={`rounded-lg px-3 py-2 text-sm ${responseMode === "chat" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {t.responseChat}
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative flex-grow">
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={payload.placeholder || t.askPlaceholder}
          className="h-full min-h-40 w-full resize-none rounded-lg border-slate-200 bg-white p-3 text-sm shadow-inner focus-visible:border-teal-500 focus-visible:ring-teal-500"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      </div>

      <div className="mt-2 text-xs text-slate-500">{t.enterNewLineHint}</div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => window.pywebview?.api.cancelAsk()} className="h-8 px-3 text-xs">
          {t.cancel}
        </Button>
        <Button onClick={submit} className="h-8 px-4 text-xs">
          {t.submit}
        </Button>
      </div>
    </div>
  )
}

function PopupUi({
  t,
  uiLang,
  changeLang,
  actions,
  builtinActions,
}: {
  t: (typeof translations)["en"]
  uiLang: UiLanguage
  changeLang: (newLang: UiLanguage) => void
  actions: SmartAction[]
  builtinActions: BuiltinAction[]
}) {
  const popupItems = useMemo(() => [...actions, ...builtinActions], [actions, builtinActions])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.pywebview?.api.cancelPopup()
        return
      }
      const match = popupItems.find((action) => action.hotkey.toLowerCase() === e.key.toLowerCase())
      if (match) {
        window.pywebview?.api.submitPopup(match.id)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [popupItems])

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-xl border border-slate-200/50 bg-slate-50/95 font-sans shadow-2xl backdrop-blur-md">
      <div className="pywebview-drag-region flex cursor-move items-center border-b border-slate-200/50 bg-white/60 p-4">
        <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-blue-100 shadow-inner">
          <Sparkles className="h-4 w-4 text-teal-600" />
        </div>
        <div className="flex-grow">
          <h2 className="text-sm font-bold text-slate-800">{t.popupTitle}</h2>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.popupSubtitle}</p>
        </div>
        <div className="mr-2">
          <LanguagePills currentLang={uiLang} onChange={changeLang} />
        </div>
        <button
          onClick={() => window.pywebview?.api.openSettings()}
          className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-teal-600"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          onClick={() => window.pywebview?.api.cancelPopup()}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-grow overflow-y-auto px-2 py-3">
        {popupItems.map((action) => {
          const isBuiltin = "kind" in action
          const hint =
            isBuiltin && action.kind === "image_ask"
              ? t.imageActionHint
              : isBuiltin && action.kind === "ai_prompt"
                ? t.aiPromptHint
                : `${(action as SmartAction).ask_before_run ? t.askBeforeRun : "Run direct"}${
                    (action as SmartAction).return_with_source ? " • With source" : ""
                  }`

          const Icon = isBuiltin ? (action.kind === "image_ask" ? Image : Bot) : ChevronRight
          const iconStyle = isBuiltin
            ? action.kind === "image_ask"
              ? "bg-amber-50 text-amber-600"
              : "bg-sky-50 text-sky-600"
            : "bg-transparent text-slate-300"

          return (
            <button
              key={action.id}
              onClick={() => window.pywebview?.api.submitPopup(action.id)}
              className="mb-1 flex w-full items-center rounded-lg border border-transparent px-3 py-2.5 text-left transition-all hover:border-slate-200/50 hover:bg-white hover:shadow-sm"
            >
              <div className="mr-3 flex h-7 w-7 items-center justify-center rounded bg-white text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                {action.hotkey.toUpperCase()}
              </div>
              <div className={`mr-3 flex h-8 w-8 items-center justify-center rounded-full ${iconStyle}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="truncate text-sm font-medium text-slate-800">{action.name}</div>
                <div className="truncate text-xs text-slate-500">{hint}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          )
        })}
      </div>

      <div className="border-t border-slate-200/50 bg-slate-100/50 p-3 text-center">
        <p className="text-[11px] font-medium text-slate-500">{t.popupFooter}</p>
      </div>
    </div>
  )
}

function SmartActionDialog({
  t,
  initialAction,
  onClose,
  onSave,
}: {
  t: (typeof translations)["en"]
  initialAction: SmartAction
  onClose: () => void
  onSave: (action: SmartAction) => void
}) {
  const [draft, setDraft] = useState<SmartAction>({ ...initialAction })
  const [error, setError] = useState("")

  const submit = () => {
    const hotkey = draft.hotkey.trim().toLowerCase()
    if (!draft.name.trim()) {
      setError(t.requiredName)
      return
    }
    if (!draft.prompt.trim()) {
      setError(t.requiredPrompt)
      return
    }
    if (hotkey.length !== 1) {
      setError(t.singleKey)
      return
    }
    onSave({
      ...draft,
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      hotkey,
    })
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {initialAction.name ? t.actionDialogEdit : t.actionDialogCreate}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 md:grid-cols-[1fr_120px]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.name}</label>
              <InputField value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.hotkey}</label>
              <InputField
                maxLength={1}
                value={draft.hotkey}
                onChange={(e) => setDraft((prev) => ({ ...prev, hotkey: e.target.value.toLowerCase() }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.prompt}</label>
            <Textarea
              value={draft.prompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              className="min-h-40 bg-white"
            />
          </div>
          <ToggleField
            checked={draft.ask_before_run}
            onChange={(value) => setDraft((prev) => ({ ...prev, ask_before_run: value }))}
            label={t.askBeforeRun}
          />
          <ToggleField
            checked={draft.return_with_source}
            onChange={(value) => setDraft((prev) => ({ ...prev, return_with_source: value }))}
            label={t.returnWithSource}
          />
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={submit}>{t.save}</Button>
        </div>
      </div>
    </div>
  )
}

function SettingsUi({
  t,
  settings,
  actions,
  builtinActions,
  onSettingsChange,
  onActionsChange,
  onBuiltinActionsChange,
  onLanguageChange,
}: {
  t: (typeof translations)["en"]
  settings: GeneralSettings
  actions: SmartAction[]
  builtinActions: BuiltinAction[]
  onSettingsChange: React.Dispatch<React.SetStateAction<GeneralSettings>>
  onActionsChange: React.Dispatch<React.SetStateAction<SmartAction[]>>
  onBuiltinActionsChange: React.Dispatch<React.SetStateAction<BuiltinAction[]>>
  onLanguageChange: (newLang: UiLanguage) => void
}) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [editingAction, setEditingAction] = useState<SmartAction | null>(null)

  const updateField = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    onSettingsChange((prev) => ({ ...prev, [key]: value }))
  }

  const normalizedKeys = useMemo(() => {
    const actionKeys = actions.map((action) => action.hotkey.trim().toLowerCase())
    const builtinKeys = builtinActions.map((action) => action.hotkey.trim().toLowerCase())
    return { actionKeys, builtinKeys, all: [...actionKeys, ...builtinKeys] }
  }, [actions, builtinActions])

  const hasDuplicateKeys = normalizedKeys.all.length !== new Set(normalizedKeys.all).size
  const hasInvalidKey = normalizedKeys.all.some((key) => key.length !== 1)
  const hasBlankName = actions.some((action) => !action.name.trim())
  const hasBlankPrompt = actions.some((action) => !action.prompt.trim())

  const saveAll = async () => {
    if (hasDuplicateKeys) {
      setError(t.duplicateKeys)
      return
    }
    if (hasInvalidKey) {
      setError(t.singleKey)
      return
    }
    if (hasBlankName) {
      setError(t.requiredName)
      return
    }
    if (hasBlankPrompt) {
      setError(t.requiredPrompt)
      return
    }

    setError("")
    setSaving(true)

    const payload = {
      settings: {
        ...settings,
        HOTKEY_POPUP: settings.HOTKEY_POPUP.trim(),
        UI_LANGUAGE: settings.UI_LANGUAGE,
      },
      builtin_actions: builtinActions.map((action) => ({
        ...action,
        hotkey: action.hotkey.trim().toLowerCase(),
      })),
      smart_actions: actions.map((action) => ({
        ...action,
        name: action.name.trim(),
        prompt: action.prompt.trim(),
        hotkey: action.hotkey.trim().toLowerCase(),
      })),
    }

    const response = await window.pywebview?.api.saveSettingsSnapshot(JSON.stringify(payload))
    if (!response?.ok) {
      setSaving(false)
      setError(response?.error || "Failed to save settings.")
      return
    }

    onBuiltinActionsChange(response.builtin_actions || payload.builtin_actions)
    onActionsChange(response.smart_actions || payload.smart_actions)
    window.pywebview?.api.closeSettings(true)
  }

  const saveDialogAction = (nextAction: SmartAction) => {
    const exists = actions.some((action) => action.id === nextAction.id)
    if (exists) {
      onActionsChange((prev) => prev.map((action) => (action.id === nextAction.id ? nextAction : action)))
    } else {
      onActionsChange((prev) => [...prev, nextAction])
    }
    setEditingAction(null)
  }

  const moveAction = (id: string, direction: -1 | 1) => {
    onActionsChange((prev) => {
      const index = prev.findIndex((action) => action.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
      <div className="pywebview-drag-region flex cursor-move items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t.settingsTitle}</h2>
            <p className="text-xs text-slate-500">{t.settingsSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={settings.UI_LANGUAGE} onChange={onLanguageChange} />
          <Button variant="outline" size="sm" onClick={() => window.pywebview?.api.closeSettings(false)}>
            {t.close}
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t.saveAll}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-6xl space-y-4">
          <SectionCard title={t.general} icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.uiLanguage}</label>
                <select
                  value={settings.UI_LANGUAGE}
                  onChange={(e) => updateField("UI_LANGUAGE", e.target.value as UiLanguage)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="zh">中文</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.popupHotkey}</label>
                <InputField value={settings.HOTKEY_POPUP} onChange={(e) => updateField("HOTKEY_POPUP", e.target.value)} />
              </div>
            </div>
            <ToggleField checked={settings.DEBUG} onChange={(value) => updateField("DEBUG", value)} label={t.debug} />
          </SectionCard>

          <SectionCard title={t.provider} icon={<Bot className="h-4 w-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.providerLabel}</label>
                <select
                  value={settings.AI_PROVIDER}
                  onChange={(e) => updateField("AI_PROVIDER", e.target.value as "gemini" | "openai")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.geminiModel}</label>
                <InputField value={settings.GEMINI_MODEL} onChange={(e) => updateField("GEMINI_MODEL", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.geminiKey}</label>
                <InputField type="password" value={settings.GEMINI_API_KEY} onChange={(e) => updateField("GEMINI_API_KEY", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.openaiModel}</label>
                <InputField value={settings.OPENAI_MODEL} onChange={(e) => updateField("OPENAI_MODEL", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.openaiKey}</label>
                <InputField type="password" value={settings.OPENAI_API_KEY} onChange={(e) => updateField("OPENAI_API_KEY", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.openaiBase}</label>
                <InputField value={settings.OPENAI_API_BASE} onChange={(e) => updateField("OPENAI_API_BASE", e.target.value)} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t.builtins} icon={<Bot className="h-4 w-4" />}>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t.builtinHint}
            </div>
            <div className="space-y-2">
              {builtinActions.map((action) => (
                <BuiltinHotkeyEditor
                  key={action.id}
                  action={action}
                  onChange={(next) =>
                    onBuiltinActionsChange((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                  }
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t.smartActions} icon={<Keyboard className="h-4 w-4" />}>
            <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">{t.actionsHint}</p>
              <Button size="sm" onClick={() => setEditingAction(createEmptyAction())}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.addAction}
              </Button>
            </div>

            <div className="space-y-2">
              {actions.map((action, index) => (
                <div key={action.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-700">
                    {action.hotkey.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-grow">
                    <div className="text-sm font-semibold text-slate-900">{action.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{action.prompt}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-1">
                        {action.ask_before_run ? t.askBeforeRun : "Run direct"}
                      </span>
                      {action.return_with_source ? (
                        <span className="rounded bg-slate-100 px-2 py-1">{t.returnWithSource}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" onClick={() => moveAction(action.id, -1)} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => moveAction(action.id, 1)} disabled={index === actions.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setEditingAction(action)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onActionsChange((prev) => prev.filter((item) => item.id !== action.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            {error ? (
              <span className="flex items-center gap-2 font-medium text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            ) : (
              t.savedHint
            )}
          </div>
        </div>
      </div>

      {editingAction ? (
        <SmartActionDialog
          t={t}
          initialAction={editingAction}
          onClose={() => setEditingAction(null)}
          onSave={saveDialogAction}
        />
      ) : null}
    </div>
  )
}

function ChatUi({
  t,
  uiLang,
  changeLang,
}: {
  t: (typeof translations)["en"]
  uiLang: UiLanguage
  changeLang: (newLang: UiLanguage) => void
}) {
  const [session, setSession] = useState<ChatSession | null>(null)
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [insertSuccess, setInsertSuccess] = useState("")
  const [isComposing, setIsComposing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [session])

  useEffect(() => {
    let mounted = true
    const bootstrap = async () => {
      const api = window.pywebview?.api
      if (!api) return
      const response = await api.bootstrapChat()
      if (!mounted) return
      if (!response?.ok) {
        setError(response?.error || t.chatErrorFallback)
      } else {
        setSession(response.session || null)
      }
      setLoading(false)
    }
    bootstrap()
    return () => {
      mounted = false
    }
  }, [t.chatErrorFallback])

  const send = async () => {
    if (!draft.trim()) return
    setSending(true)
    setError("")
    setInsertSuccess("")
    const response = await window.pywebview?.api.sendChatMessage(draft.trim())
    setSending(false)
    if (!response?.ok) {
      setError(response?.error || t.chatErrorFallback)
      return
    }
    setSession(response.session || null)
    setDraft("")
    textareaRef.current?.focus()
  }

  const insertLatestReply = async () => {
    setError("")
    setInsertSuccess("")
    const response = await window.pywebview?.api.insertLatestReply()
    if (!response?.ok) {
      setError(response?.error || t.chatErrorFallback)
      return
    }
    setInsertSuccess(t.chatInsertSuccess)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
    const composing = isComposing || Boolean(native.isComposing)

    if (e.key === "Escape" && !composing) {
      e.preventDefault()
      window.pywebview?.api.closeChat()
      return
    }

    if (composing) return

    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-teal-600" />
            {session?.title || t.chatTitle}
          </h2>
          <p className="text-xs text-slate-500">
            {session?.context_hint ||
              (session?.kind === "image_ask" ? t.chatContextImage : t.chatContextText)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={uiLang} onChange={changeLang} />
          <button
            onClick={() => window.pywebview?.api.closeChat()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            {t.chatLoading}
          </div>
        ) : session?.messages?.length ? (
          <div className="space-y-3">
            {session.messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[85%] rounded-lg px-4 py-3 text-sm shadow-sm ${
                  message.role === "assistant"
                    ? "border border-slate-200 bg-white text-slate-800"
                    : "ml-auto bg-teal-600 text-white"
                }`}
              >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {message.role === "assistant" ? "AI" : "You"}
                </div>
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            {t.chatEmpty}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-4">
        {error ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
        {insertSuccess ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {insertSuccess}
          </div>
        ) : null}

        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={t.chatPlaceholder}
          className="min-h-28 resize-none bg-white"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
        <div className="mt-2 text-xs text-slate-500">{t.enterNewLineHint}</div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={insertLatestReply} disabled={!session?.latest_reply}>
            {t.insertLatestReply}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.pywebview?.api.closeChat()}>
              {t.close}
            </Button>
            <Button onClick={() => void send()} disabled={sending || !draft.trim()}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {t.send}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<PageKind>("ask")
  const [lang, setLang] = useState<UiLanguage>("en")
  const [settings, setSettings] = useState<GeneralSettings>(defaultSettings)
  const [actions, setActions] = useState<SmartAction[]>([])
  const [builtinActions, setBuiltinActions] = useState<BuiltinAction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pageParam = params.get("page")
    if (pageParam === "popup" || pageParam === "settings" || pageParam === "ask" || pageParam === "chat") {
      setPage(pageParam)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const hydrate = async () => {
      try {
        const api = await waitForPywebviewApi()
        const snapshot = await api.getSettingsSnapshot()
        if (snapshot && mounted) {
          setSettings({ ...defaultSettings, ...snapshot.settings })
          setActions(snapshot.smart_actions || [])
          setBuiltinActions(snapshot.builtin_actions || [])
          setLang((snapshot.settings?.UI_LANGUAGE || "en") as UiLanguage)
        }
      } catch {
        if (mounted) {
          setLoadError((translations[lang] || translations.en).loadError)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    hydrate()
    return () => {
      mounted = false
    }
  }, [])

  const changeLang = (newLang: UiLanguage) => {
    setLang(newLang)
    setSettings((prev) => ({ ...prev, UI_LANGUAGE: newLang }))
    window.pywebview?.api.setUiLanguage(newLang)
  }

  const t = translations[lang] || translations.en

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-sm">{loadError}</div>
      </div>
    )
  }

  if (page === "popup") {
    return <PopupUi t={t} uiLang={lang} changeLang={changeLang} actions={actions} builtinActions={builtinActions} />
  }

  if (page === "settings") {
    return (
      <SettingsUi
        t={t}
        settings={settings}
        actions={actions}
        builtinActions={builtinActions}
        onSettingsChange={setSettings}
        onActionsChange={setActions}
        onBuiltinActionsChange={setBuiltinActions}
        onLanguageChange={changeLang}
      />
    )
  }

  if (page === "chat") {
    return <ChatUi t={t} uiLang={lang} changeLang={changeLang} />
  }

  return <AskUi t={t} uiLang={lang} changeLang={changeLang} />
}
