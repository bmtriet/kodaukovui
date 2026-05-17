import { useEffect, useMemo } from "react"
import { AlertCircle, Bot, ChevronRight, Image, Settings, Sparkles, X } from "lucide-react"
import type { UiLanguage, SmartAction, BuiltinAction } from "../types"
import { isEditableTarget, isImeComposing } from "../types"
import type { EnTranslations } from "../i18n"

export function PopupPage({
  t,
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
    const hotkeyLabel = action.hotkey.replace(/[<>]/g, "").toUpperCase()
    const hint =
      isBuiltin && action.kind === "image_ask"
        ? t.imageActionHint
        : isBuiltin && action.kind === "ai_prompt"
          ? t.aiPromptHint
          : `${(action as SmartAction).ask_before_run ? t.askBeforeRun : t.runDirect}${
              (action as SmartAction).return_with_source ? ` • ${t.withSource}` : ""
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
        className={`group flex w-full min-w-0 items-center rounded-xl border bg-white text-left transition hover:border-teal-200 hover:bg-teal-50/30 ${
          isBuiltin
            ? "border-teal-200 px-3 py-2.5 shadow-[0_8px_24px_rgba(20,184,166,0.08)]"
            : "border-slate-200/90 px-3 py-2 shadow-sm"
        }`}
      >
        <div
          className="mr-2.5 flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-1 text-[11px] font-bold leading-none tracking-tight text-slate-800 shadow-sm"
          title={action.hotkey}
        >
          <span className="max-w-full truncate">{hotkeyLabel}</span>
        </div>
        <div className={`mr-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 ${iconStyle}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-grow">
          <div className="truncate text-sm font-semibold text-slate-900">{action.name}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{hint}</div>
        </div>
      </button>
    )
  }

  return (
    <div className="h-screen bg-transparent p-2.5 font-sans text-slate-900">
      <div className="flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-teal-200/80 bg-white/96 shadow-[0_24px_70px_rgba(15,23,42,0.22),0_0_0_1px_rgba(45,212,191,0.20)] backdrop-blur-xl">
        <div className="desktop-drag-region flex cursor-move items-center border-b border-slate-200/80 px-3 py-3">
          <div className="mr-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-slate-800">{t.popupTitle}</h2>
            <p className="truncate text-xs text-slate-500">{t.popupSubtitle}</p>
          </div>
          <button
            onClick={() => window.desktopApi?.openSettings()}
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-600"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => window.desktopApi?.cancelPopup()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-2 flex items-center gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t.popupTextActions}</h3>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-2">
              {textItems.map((action) => renderPopupAction(action))}
            </div>
          </div>

          <div className="border-t border-slate-200/80 bg-slate-50/70 px-4 py-3">
            <div className="mb-2 flex items-center gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t.popupAiTools}</h3>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-2">
              {aiItems.map((action) => renderPopupAction(action))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200/80 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <AlertCircle className="h-4 w-4 text-slate-400" />
            {t.popupFooter}
          </div>
        </div>
      </div>
    </div>
  )
}
