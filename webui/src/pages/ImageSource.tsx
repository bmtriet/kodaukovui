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
    <div className="min-h-screen bg-slate-900/55 p-8 font-sans text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-white/95 shadow-[0_40px_120px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-12 py-10">
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-100 via-cyan-50 to-white text-teal-700 shadow-inner ring-1 ring-teal-100">
              <Image className="h-10 w-10" />
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-slate-800">{payload.title || t.imageSourceTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguagePills currentLang={uiLang} onChange={changeLang} />
            <button
              onClick={() => window.desktopApi?.cancelImageSource()}
              className="flex h-14 w-14 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-8 w-8" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between px-14 py-12">
          <div>
            <div className="mb-12 flex items-center gap-10">
              <div className="flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-slate-50 text-sky-500 shadow-inner">
                <Clipboard className="h-20 w-20" />
              </div>
              <div className="max-w-3xl">
                <h2 className="text-6xl font-bold leading-tight tracking-tight text-slate-800">{t.imageSourceHeadline}</h2>
                <p className="mt-5 text-3xl leading-relaxed text-slate-500">{t.imageSourceSubtitle}</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelectedSource("clipboard")}
                className={`group flex items-center gap-6 rounded-[1.75rem] border px-8 py-10 text-left transition-all ${
                  selectedSource === "clipboard"
                    ? "border-teal-300 bg-gradient-to-br from-teal-50 to-white shadow-[0_20px_60px_rgba(13,148,136,0.12)]"
                    : "border-sky-100 bg-white hover:border-teal-200 hover:bg-slate-50"
                }`}
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-full ${selectedSource === "clipboard" ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-400 group-hover:text-teal-600"}`}>
                  <Check className="h-8 w-8" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-teal-700">{t.imageSourceClipboardTitle}</div>
                  <div className="mt-3 text-xl leading-relaxed text-slate-500">{t.imageSourceClipboardBody}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSource("roi")}
                className={`group flex items-center gap-6 rounded-[1.75rem] border px-8 py-10 text-left transition-all ${
                  selectedSource === "roi"
                    ? "border-sky-300 bg-gradient-to-br from-sky-50 to-white shadow-[0_20px_60px_rgba(59,130,246,0.12)]"
                    : "border-sky-100 bg-white hover:border-sky-200 hover:bg-slate-50"
                }`}
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-full ${selectedSource === "roi" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-400 group-hover:text-sky-600"}`}>
                  <Crop className="h-8 w-8" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-sky-700">{t.imageSourceRoiTitle}</div>
                  <div className="mt-3 text-xl leading-relaxed text-slate-500">{t.imageSourceRoiBody}</div>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-between border-t border-slate-200/80 pt-8">
            <label
              className="flex items-center gap-4 text-xl text-slate-700 cursor-pointer select-none"
              onClick={() => setDoNotAskAgain(!doNotAskAgain)}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 transition ${doNotAskAgain ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 bg-white"}`}>
                {doNotAskAgain ? <Check className="h-5 w-5" /> : null}
              </span>
              {t.imageSourceDoNotAsk}
            </label>

            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => window.desktopApi?.cancelImageSource()}
                className="rounded-2xl border border-slate-300 bg-white px-10 py-5 text-2xl font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={submit}
                className={`rounded-2xl px-12 py-5 text-2xl font-semibold text-white shadow-[0_20px_60px_rgba(15,118,110,0.25)] transition ${
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
