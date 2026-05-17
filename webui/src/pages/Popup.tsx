import { useEffect, useMemo } from "react"
import { AlertCircle, Bot, ChevronRight, Image, Settings, Sparkles, X } from "lucide-react"
import { LanguagePills } from "../components/LanguagePills"
import type { UiLanguage, SmartAction, BuiltinAction } from "../types"
import { isEditableTarget, isImeComposing } from "../types"
import type { EnTranslations } from "../i18n"

export function PopupPage({
  t,
  uiLang,
  changeLang,
  actions,
  builtinActions,
}: {
  t: EnTranslations
  uiLang: UiLanguage
  changeLang: (newLang: UiLanguage) => void
  actions: SmartAction[]
  builtinActions: BuiltinAction[]
}) {
  const textItems = useMemo(() => actions, [actions])
  const aiItems = useMemo(() => builtinActions, [builtinActions])
  const popupItems = useMemo(() => [...textItems, ...aiItems], [textItems, aiItems])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isImeComposing(e) || isEditableTarget(e.target)) return
      if (e.key === "Escape") {
        window.desktopApi?.cancelPopup()
        return
      }
      const match = popupItems.find((action) => action.hotkey.toLowerCase() === e.key.toLowerCase())
      if (match) {
        window.desktopApi?.submitPopup(match.id)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [popupItems])

  const renderPopupAction = (action: SmartAction | BuiltinAction) => {
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
        ? "text-amber-500"
        : "text-teal-600"
      : "text-teal-500"

    return (
      <button
        key={action.id}
        onClick={() => window.desktopApi?.submitPopup(action.id)}
        className="group flex items-center rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-teal-200 hover:shadow-[0_12px_28px_rgba(20,184,166,0.08)]"
      >
        <div className="mr-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xl font-bold text-slate-800 shadow-sm">
          {action.hotkey.toUpperCase()}
        </div>
        <div className={`mr-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ${iconStyle}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-grow">
          <div className="truncate text-sm font-semibold text-slate-900">{action.name}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{hint}</div>
        </div>
      </button>
    )
  }

  return (
    <div className="h-screen bg-transparent p-3 font-sans text-slate-900">
      <div className="flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-teal-200/80 bg-white/96 shadow-[0_28px_80px_rgba(15,23,42,0.22),0_0_0_1px_rgba(45,212,191,0.22)] backdrop-blur-xl">
        <div className="desktop-drag-region flex cursor-move items-center border-b border-slate-200/80 px-5 py-4">
          <div className="mr-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 via-cyan-50 to-white shadow-inner ring-1 ring-teal-100">
            <Sparkles className="h-6 w-6 text-teal-600" />
          </div>
          <div className="flex-grow">
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t.popupTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.popupSubtitle}</p>
          </div>
          <div className="mr-3">
            <LanguagePills currentLang={uiLang} onChange={changeLang} />
          </div>
          <button
            onClick={() => window.desktopApi?.openSettings()}
            className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-600"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={() => window.desktopApi?.cancelPopup()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t.popupTextActions}</h3>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {textItems.map((action) => renderPopupAction(action))}
          </div>

          <div className="my-5 flex items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t.popupAiTools}</h3>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {aiItems.map((action) => renderPopupAction(action))}
          </div>
        </div>

        <div className="border-t border-slate-200/80 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-sm">
            <AlertCircle className="h-4 w-4 text-slate-400" />
            {t.popupFooter}
          </div>
        </div>
      </div>
    </div>
  )
}
