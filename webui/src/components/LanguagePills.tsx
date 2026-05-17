import type { UiLanguage } from "../types"

export function LanguagePills({
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
