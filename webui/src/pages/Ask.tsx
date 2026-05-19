import { useEffect, useRef, useState } from "react"
import { Camera, FileText, MessageSquare, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LanguagePills } from "../components/LanguagePills"
import type { UiLanguage, ResponseMode, AskPayload, ImagePayload } from "../types"
import { parsePayload, waitForDesktopApi } from "../types"
import type { EnTranslations } from "../i18n"

export function AskPage({
  t,
  uiLang,
  changeLang,
}: {
  t: EnTranslations
  uiLang: UiLanguage
  changeLang: (newLang: UiLanguage) => void
}) {
  const payload = parsePayload<AskPayload>()
  const placeholder =
    payload.placeholder || (payload.contextMode === "prompt_only" ? t.askPlaceholderPromptOnly : t.askPlaceholder)
  const [prompt, setPrompt] = useState("")
  const [responseMode, setResponseMode] = useState<ResponseMode>(payload.defaultResponseMode || "paste")
  const [isComposing, setIsComposing] = useState(false)
  const [compositionLockedUntil, setCompositionLockedUntil] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [imagePayload, setImagePayload] = useState<ImagePayload | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isPromptOnly = payload.contextMode === "prompt_only"
  const selectedText = payload.selectedText || ""
  const hasSelectedText = !isPromptOnly && !!selectedText
  const selectedLineCount = selectedText ? selectedText.split(/\n/).length : 0
  const imagePreviewUrl = imagePayload?.image_base64
    ? `data:${imagePayload.mime_type || "image/png"};base64,${imagePayload.image_base64}`
    : ""

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      textareaRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    if (!payload.imageContextAvailable) return
    let mounted = true
    const hydrateImage = async () => {
      const api = await waitForDesktopApi()
      const response = await api.getAskImageContext()
      if (mounted && response?.image_payload) {
        setImagePayload(response.image_payload)
      }
    }
    hydrateImage().catch(() => {})
    return () => {
      mounted = false
    }
  }, [payload.imageContextAvailable])

  const submit = () => {
    window.desktopApi?.submitAsk(prompt.trim(), responseMode)
  }

  const takeNewShot = async () => {
    const response = await window.desktopApi?.retakeImageForAsk()
    if (response?.ok) {
      const imageResponse = await window.desktopApi?.getAskImageContext()
      setImagePayload(imageResponse?.image_payload || null)
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
    const composing = isComposing || Boolean(native.isComposing) || Date.now() < compositionLockedUntil

    if (e.key === "Escape" && !composing) {
      e.preventDefault()
      window.desktopApi?.cancelAsk()
      return
    }

    if (composing) return

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-teal-600" />
            <span className="truncate">{payload.title || t.askTitle}</span>
          </h2>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
            {isPromptOnly ? <MessageSquare className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {isPromptOnly ? t.contextPromptOnly : t.contextSelectedText}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={uiLang} onChange={changeLang} />
          <button
            onClick={() => window.desktopApi?.cancelAsk()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
        <div className="grid shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
          {imagePreviewUrl ? (
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:border-teal-300"
              >
                <img src={imagePreviewUrl} alt="Image context" className="h-20 w-28 object-cover" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Image context</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {imagePayload?.source === "clipboard_image" ? "Clipboard image" : "Screen region"}
                </div>
                <button type="button" onClick={() => setPreviewOpen(true)} className="mt-1 text-xs font-medium text-teal-700 hover:underline">
                  Preview
                </button>
              </div>
            </div>
          ) : hasSelectedText ? (
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-teal-200 bg-teal-50/30 p-3 shadow-sm">
              <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-white">
                <FileText className="h-8 w-8 text-teal-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Text context</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {selectedLineCount} {selectedLineCount === 1 ? "line" : "lines"} of selected text
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                  {selectedText.slice(0, 240)}{selectedText.length > 240 ? "…" : ""}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            {payload.responseModeEnabled ? (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.responseMode}</div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setResponseMode("paste")}
                    className={`h-8 rounded text-xs font-semibold ${responseMode === "paste" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}
                  >
                    {t.responsePaste}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseMode("chat")}
                    className={`h-8 rounded text-xs font-semibold ${responseMode === "chat" ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-white/60"}`}
                  >
                    {t.responseChat}
                  </button>
                </div>
              </div>
            ) : null}
            {imagePreviewUrl ? (
              <Button variant="outline" onClick={() => void takeNewShot()} className="h-9 w-full justify-center px-3 text-xs">
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {t.takeNewShot}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => {
              setIsComposing(false)
              setCompositionLockedUntil(Date.now() + 30)
            }}
            onKeyDown={handleTextareaKeyDown}
            placeholder={placeholder}
            className="h-full min-h-0 w-full resize-none rounded-lg border-slate-200 bg-white p-4 text-sm shadow-sm focus-visible:border-teal-500 focus-visible:ring-teal-500"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="text-xs text-slate-500">{t.enterNewLineHint}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.desktopApi?.cancelAsk()} className="h-8 px-3 text-xs">
              {t.cancel}
            </Button>
            <Button onClick={submit} className="h-8 px-4 text-xs">
              {t.submit}
            </Button>
          </div>
        </div>
      </div>

      {previewOpen && imagePreviewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-5" onClick={() => setPreviewOpen(false)}>
          <button
            type="button"
            aria-label={t.close}
            onClick={() => setPreviewOpen(false)}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-h-[90vh] max-w-[90vw] overflow-auto">
            <img
              src={imagePreviewUrl}
              alt="Image context preview"
              onClick={() => setPreviewOpen(false)}
              className="h-auto w-auto max-h-[90vh] max-w-[90vw] cursor-zoom-out rounded-md bg-white shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
