import { useEffect, useRef, useState } from "react"
import { AlertCircle, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LanguagePills } from "../components/LanguagePills"
import type { UiLanguage, ChatSession } from "../types"
import { waitForDesktopApi } from "../types"
import type { EnTranslations } from "../i18n"

export function ChatPage({
  t,
  uiLang,
  changeLang,
}: {
  t: EnTranslations
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
  const [compositionLockedUntil, setCompositionLockedUntil] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      textareaRef.current?.focus()
    }
  }, [session])

  useEffect(() => {
    let mounted = true
    const bootstrap = async () => {
      const api = await waitForDesktopApi()
      if (!mounted) return
      const response = await api.bootstrapChat()
      if (!mounted) return
      if (!response?.ok) {
        setError(response?.error || t.chatErrorFallback)
      } else {
        setSession(response.session || null)
      }
      setLoading(false)
    }
    bootstrap().catch(() => {
      if (mounted) {
        setError(t.chatErrorFallback)
        setLoading(false)
      }
    })
    return () => {
      mounted = false
    }
  }, [t.chatErrorFallback])

  const send = async () => {
    if (!draft.trim()) return
    setSending(true)
    setError("")
    setInsertSuccess("")
    const response = await window.desktopApi?.sendChatMessage(draft.trim())
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
    const response = await window.desktopApi?.insertLatestReply()
    if (!response?.ok) {
      setError(response?.error || t.chatErrorFallback)
      return
    }
    setInsertSuccess(t.chatInsertSuccess)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
    const composing = isComposing || Boolean(native.isComposing) || Date.now() < compositionLockedUntil

    if (e.key === "Escape" && !composing) {
      e.preventDefault()
      window.desktopApi?.closeChat()
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
              (session?.kind === "image_ask"
                ? t.chatContextImage
                : session?.selected_text
                  ? t.chatContextText
                  : t.chatContextPromptOnly)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={uiLang} onChange={changeLang} />
          <button
            onClick={() => window.desktopApi?.closeChat()}
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
          onCompositionEnd={() => {
            setIsComposing(false)
            setCompositionLockedUntil(Date.now() + 30)
          }}
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
            <Button variant="outline" onClick={() => window.desktopApi?.closeChat()}>
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
