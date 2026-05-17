import { useState } from "react"
import { Check, Clipboard, Crop, Image, X } from "lucide-react"
import { LanguagePills } from "../components/LanguagePills"
import type { UiLanguage, ImageSourcePayload } from "../types"
import { parsePayload } from "../types"
import type { EnTranslations } from "../i18n"

export function ImageSourcePage({
  t,
  uiLang,
  changeLang,
}: {
  t: EnTranslations
  uiLang: UiLanguage
  changeLang: (newLang: UiLanguage) => void
}) {
  const payload = parsePayload<ImageSourcePayload>()
  const [selectedSource, setSelectedSource] = useState<"clipboard" | "roi">("clipboard")
  const [doNotAskAgain, setDoNotAskAgain] = useState(false)

  const submit = () => {
    window.desktopApi?.chooseImageSource(selectedSource, doNotAskAgain)
  }

  return (
    <div className="min-h-screen bg-slate-900/45 p-5 font-sans text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/50 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-7 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <Image className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-slate-800">{payload.title || t.imageSourceTitle}</h1>
              <p className="mt-1 text-sm text-slate-500">{t.imageSourceSubtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LanguagePills currentLang={uiLang} onChange={changeLang} />
            <button
              onClick={() => window.desktopApi?.cancelImageSource()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between px-7 py-6">
          <div>
            <div className="mb-6 flex items-center gap-5 rounded-xl bg-slate-50 px-5 py-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                <Clipboard className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <h2 className="text-3xl font-bold tracking-tight text-slate-800">{t.imageSourceHeadline}</h2>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelectedSource("clipboard")}
                className={`group flex min-h-36 items-center gap-4 rounded-xl border px-5 py-5 text-left transition-all ${
                  selectedSource === "clipboard"
                    ? "border-teal-300 bg-teal-50 shadow-[0_18px_45px_rgba(13,148,136,0.12)]"
                    : "border-sky-100 bg-white hover:border-teal-200 hover:bg-slate-50"
                }`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${selectedSource === "clipboard" ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-400 group-hover:text-teal-600"}`}>
                  <Check className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-lg font-bold text-teal-700">{t.imageSourceClipboardTitle}</div>
                  <div className="mt-2 text-sm leading-relaxed text-slate-500">{t.imageSourceClipboardBody}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSource("roi")}
                className={`group flex min-h-36 items-center gap-4 rounded-xl border px-5 py-5 text-left transition-all ${
                  selectedSource === "roi"
                    ? "border-sky-300 bg-sky-50 shadow-[0_18px_45px_rgba(59,130,246,0.12)]"
                    : "border-sky-100 bg-white hover:border-sky-200 hover:bg-slate-50"
                }`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${selectedSource === "roi" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-400 group-hover:text-sky-600"}`}>
                  <Crop className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-lg font-bold text-sky-700">{t.imageSourceRoiTitle}</div>
                  <div className="mt-2 text-sm leading-relaxed text-slate-500">{t.imageSourceRoiBody}</div>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-5">
            <label
              className="flex cursor-pointer select-none items-center gap-3 text-sm text-slate-700"
              onClick={() => setDoNotAskAgain(!doNotAskAgain)}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 transition ${doNotAskAgain ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 bg-white"}`}>
                {doNotAskAgain ? <Check className="h-4 w-4" /> : null}
              </span>
              {t.imageSourceDoNotAsk}
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.desktopApi?.cancelImageSource()}
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={submit}
                className={`rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(15,118,110,0.18)] transition ${
                  selectedSource === "clipboard" ? "bg-teal-600 hover:bg-teal-700" : "bg-sky-600 hover:bg-sky-700"
                }`}
              >
                {selectedSource === "clipboard" ? t.imageSourceConfirmClipboard : t.imageSourceConfirmRoi}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
