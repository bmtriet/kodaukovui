import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Bot, CircleHelp, Globe2, Image, Settings, Sparkles, Type, X } from "lucide-react"
import { parsePayload, type PopupItem, type PopupPayload, type PopupSection, type UiLanguage } from "../types"
import { isEditableTarget, isImeComposing } from "../types"
import { waitForDesktopApi } from "../types"
import { LanguagePills } from "../components/LanguagePills"
import type { EnTranslations } from "../i18n"

export function PopupPage({ t, uiLang, changeLang }: { t: EnTranslations; uiLang: UiLanguage; changeLang: (newLang: UiLanguage) => void }) {
  const payload = useMemo(() => parsePayload<PopupPayload>(), [])
  const sections = payload.sections || []
  const popupItems = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const [provider, setProvider] = useState("gemini")
  const [showAbout, setShowAbout] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isImeComposing(e) || isEditableTarget(e.target)) return
      if (e.key === "Escape") {
        window.desktopApi?.cancelPopup()
        return
      }
      const match = popupItems.find((action) => action.shortcut.toLowerCase() === e.key.toLowerCase())
      if (match) {
        window.desktopApi?.submitPopup(match.id)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [popupItems])

  useEffect(() => {
    let mounted = true
    const hydrateProvider = async () => {
      const api = await waitForDesktopApi()
      const snapshot = await api.getSettingsSnapshot()
      if (!mounted) return
      setProvider((snapshot?.settings?.AI_PROVIDER || "gemini").toLowerCase())
    }
    hydrateProvider().catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const renderQuickTranslate = (section: PopupSection) => (
    <div className="grid grid-cols-3 gap-2">
      {section.items.map((action) => (
        <button
          key={action.id}
          aria-label={`${action.label} (${action.shortcut.toUpperCase()})`}
          onClick={() => window.desktopApi?.submitPopup(action.id)}
          className="group flex h-10 min-w-0 items-center gap-2 rounded-xl border border-teal-200 bg-white px-2.5 text-left shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-white text-sm font-bold text-teal-800">
            {action.shortcut.toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold text-slate-900">{action.short_label || action.label}</span>
        </button>
      ))}
    </div>
  )

  const renderActionRow = (action: PopupItem) => {
    const Icon = action.kind === "image_ask" ? Image : action.kind === "ai_prompt" ? Bot : action.id === "add-vietnamese-marks" ? Bot : Type
    const accentClass =
      action.kind === "image_ask"
        ? "text-amber-500"
        : action.kind === "ai_prompt" || action.id === "add-vietnamese-marks"
          ? "text-teal-600"
          : "text-slate-500"

    return (
      <button
        key={action.id}
        aria-label={`${action.label} (${action.shortcut.toUpperCase()})`}
        onClick={() => window.desktopApi?.submitPopup(action.id)}
        className="group flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-left transition hover:border-teal-200 hover:bg-teal-50/30"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800">
          {action.shortcut.toUpperCase()}
        </span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{action.label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {action.ask_before_run ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t.askBeforeRun}
            </span>
          ) : null}
          {action.return_with_source ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t.withSource}
            </span>
          ) : null}
        </div>
      </button>
    )
  }

  const renderSection = (section: PopupSection) => {
    const title =
      section.id === "quick_translate"
        ? t.quickTranslate
        : section.id === "ai_tools"
          ? t.popupAiTools
          : section.id === "text_tools"
            ? t.popupTextTools
            : t.popupOtherActions
    const SectionIcon =
      section.id === "quick_translate" ? Globe2 : section.id === "ai_tools" ? Bot : section.id === "text_tools" ? Type : Sparkles

    return (
      <section key={section.id} className="space-y-2">
        <div className="flex h-5 items-center gap-2">
          <SectionIcon className="h-4 w-4 text-teal-700" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        {section.id === "quick_translate" ? (
          renderQuickTranslate(section)
        ) : (
          <div className="space-y-1.5">{section.items.map((action) => renderActionRow(action))}</div>
        )}
      </section>
    )
  }

  return (
    <div className="h-screen bg-white font-sans text-slate-900">
      <div className="flex h-full flex-col overflow-hidden border border-slate-200/80 bg-white">
        <div className="desktop-drag-region flex cursor-move items-center border-b border-slate-200/80 px-3 py-3">
          <div className="mr-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-slate-800">{t.popupTitle}</h2>
            <p className="truncate text-xs text-slate-500">{t.popupSubtitle} · {t.currentProvider}: {provider}</p>
          </div>
          <button
            aria-label={t.about}
            onClick={() => setShowAbout(true)}
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-600"
          >
            <CircleHelp className="h-[18px] w-[18px]" />
          </button>
          <button
            aria-label={t.openSettings}
            onClick={() => window.desktopApi?.openSettings()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-600"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button
            aria-label={t.closePopup}
            onClick={() => window.desktopApi?.cancelPopup()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">{sections.map((section) => renderSection(section))}</div>
        </div>

        <div className="border-t border-slate-200/80 bg-white px-4 py-2">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
            {t.popupFooter}
          </div>
          <div className="flex justify-end">
            <LanguagePills currentLang={uiLang} onChange={changeLang} />
          </div>
        </div>
      </div>
      {showAbout ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{t.aboutTitle}</h3>
              <button
                aria-label={t.close}
                onClick={() => setShowAbout(false)}
                className="flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold">{t.authorLabel}:</span> Triết Bùi</p>
              <p><span className="font-semibold">GitHub:</span> <a className="text-teal-700 underline" href="https://github.com/bmtriet/kodaukovui">github.com/bmtriet/kodaukovui</a></p>
              <p><span className="font-semibold">Facebook:</span> <a className="text-teal-700 underline" href="https://fb.me/trietbui89">fb.me/trietbui89</a></p>
              <p><span className="font-semibold">Email:</span> <a className="text-teal-700 underline" href="mailto:minhtrietbui@live.com">minhtrietbui@live.com</a></p>
            </div>
            <p className="mt-3 text-xs text-slate-500">{t.aboutContributeHint}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
