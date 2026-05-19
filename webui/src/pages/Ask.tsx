import { useEffect, useRef, useState } from "react"
import { FileText, MessageSquare, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LanguagePills } from "../components/LanguagePills"
import type { UiLanguage, ResponseMode, AskPayload } from "../types"
import { parsePayload } from "../types"
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isPromptOnly = payload.contextMode === "prompt_only"

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      textareaRef.current?.focus()
    }
  }, [])

  const submit = () => {
    window.desktopApi?.submitAsk(prompt.trim(), responseMode)
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
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
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

      {payload.responseModeEnabled ? (
        <div className="mb-3 flex items-center justify-between border border-slate-200 bg-white px-3 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.responseMode}</div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setResponseMode("paste")}
              className={`px-3 py-1.5 text-sm ${responseMode === "paste" ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {t.responsePaste}
            </button>
            <button
              type="button"
              onClick={() => setResponseMode("chat")}
              className={`px-3 py-1.5 text-sm ${responseMode === "chat" ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
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
          onCompositionEnd={() => {
            setIsComposing(false)
            setCompositionLockedUntil(Date.now() + 30)
          }}
          onKeyDown={handleTextareaKeyDown}
          placeholder={placeholder}
          className="h-full min-h-40 w-full resize-none rounded-lg border-slate-200 bg-white p-3 text-sm shadow-inner focus-visible:border-teal-500 focus-visible:ring-teal-500"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      </div>

      <div className="mt-2 text-xs text-slate-500">{t.enterNewLineHint}</div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => window.desktopApi?.cancelAsk()} className="h-8 px-3 text-xs">
          {t.cancel}
        </Button>
        <Button onClick={submit} className="h-8 px-4 text-xs">
          {t.submit}
        </Button>
      </div>
    </div>
  )
}
