import { useEffect, useRef, useState } from "react"
import { AlertCircle, Check, ChevronDown, Copy, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LanguagePills } from "../components/LanguagePills"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { UiLanguage, ChatSession } from "../types"
import { waitForDesktopApi } from "../types"
import type { EnTranslations } from "../i18n"
import { markdownToPlainText } from "../markdown"

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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [menuOpenIndex, setMenuOpenIndex] = useState<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bootstrapStartedRef = useRef(false)

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      textareaRef.current?.focus()
    }
  }, [session])

  useEffect(() => {
    if (bootstrapStartedRef.current) return
    bootstrapStartedRef.current = true
    let mounted = true
    const bootstrap = async () => {
      const api = await waitForDesktopApi()
      if (!mounted) return
      const initialState = await api.getChatState()
      if (!mounted) return
      if (initialState?.ok) {
        const initialSession = initialState.session || null
        setSession(initialSession)
        setLoading(false)
        setSending(Boolean(initialSession?.messages?.length && !initialSession.latest_reply))
      }
      const response = await api.bootstrapChat()
      if (!mounted) return
      setSending(false)
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
    const prompt = draft.trim()
    if (!prompt) return
    setSending(true)
    setError("")
    setInsertSuccess("")
    setDraft("")
    setSession((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, { role: "user", content: prompt }],
          }
        : current,
    )
    const response = await window.desktopApi?.sendChatMessage(prompt)
    setSending(false)
    if (!response?.ok) {
      setError(response?.error || t.chatErrorFallback)
      return
    }
    setSession(response.session || null)
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
    window.setTimeout(() => window.desktopApi?.closeChat(), 400)
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

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      setMenuOpenIndex((prev) => (prev === index ? null : prev))
      window.setTimeout(() => setCopiedIndex((prev) => (prev === index ? null : prev)), 1200)
    } catch {
      setError(t.chatErrorFallback)
    }
  }

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollTop = scroller.scrollHeight
  }, [session, sending])

  const imagePreviewUrl =
    session?.kind === "image_ask" && session.image_payload?.image_base64
      ? `data:${session.image_payload?.mime_type || "image/png"};base64,${session.image_payload.image_base64}`
      : ""

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
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
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  <span>{message.role === "assistant" ? t.chatRoleAi : t.chatRoleYou}</span>
                  {message.role === "assistant" ? (
                    <div className="relative">
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        onClick={() => setMenuOpenIndex((prev) => (prev === index ? null : index))}
                      >
                        {copiedIndex === index ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedIndex === index ? t.copied : t.copy}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {menuOpenIndex === index ? (
                        <div className="absolute right-0 z-10 mt-1 min-w-40 border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 shadow-lg">
                          <button
                            className="block w-full px-2 py-1.5 text-left hover:bg-slate-50"
                            onClick={() => void copyMessage(message.content, index)}
                          >
                            {t.copy}
                          </button>
                          <button
                            className="block w-full px-2 py-1.5 text-left hover:bg-slate-50"
                            onClick={() => void copyMessage(markdownToPlainText(message.content), index)}
                          >
                            {t.copyPlain}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {message.role === "assistant" ? (
                  <div className="break-words leading-relaxed [&_a]:text-teal-700 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-100 [&_pre]:p-2">
                    <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {session?.kind === "image_ask" && index === 0 && imagePreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="block overflow-hidden rounded-md border border-white/40 bg-white/10 transition hover:bg-white/20"
                        title={t.chatPreviewImage}
                      >
                        <img src={imagePreviewUrl} alt={t.chatImageAlt} className="h-24 w-auto max-w-44 object-cover" />
                      </button>
                    ) : null}
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  </div>
                )}
              </div>
            ))}
            {sending ? (
              <div className="max-w-[85%] rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">{t.chatRoleAi}</div>
                <div className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:180ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:360ms]" />
                </div>
              </div>
            ) : null}
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

      {previewOpen && imagePreviewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="max-h-[90vh] max-w-[90vw] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img src={imagePreviewUrl} alt={t.contextImagePreview} className="h-auto w-auto max-h-[90vh] max-w-[90vw] rounded-md" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
