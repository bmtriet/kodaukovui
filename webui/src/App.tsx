import { useEffect, useState } from "react"
import { installDesktopApiBridge } from "@/desktop-api"
import { AskPage } from "./pages/Ask"
import { PopupPage } from "./pages/Popup"
import { SettingsPage } from "./pages/Settings"
import { ChatPage } from "./pages/Chat"
import { ImageSourcePage } from "./pages/ImageSource"
import {
  defaultSettings,
  readPageParam,
  readUiLangParam,
  waitForDesktopApi,
} from "./types"
import { getTranslations } from "./i18n"
import type { GeneralSettings, SmartAction, BuiltinAction, UiLanguage, PageKind, DesktopApi } from "./types"

installDesktopApiBridge()

declare global {
  interface Window {
    desktopApi?: DesktopApi
  }
}

export default function App() {
  const [page] = useState<PageKind>(() => readPageParam())
  const [lang, setLang] = useState<UiLanguage>(() => readUiLangParam())
  const [settings, setSettings] = useState<GeneralSettings>(defaultSettings)
  const [actions, setActions] = useState<SmartAction[]>([])
  const [builtinActions, setBuiltinActions] = useState<BuiltinAction[]>([])
  const requiresSettingsSnapshot = page === "settings"
  const [loading, setLoading] = useState(requiresSettingsSnapshot)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    if (!requiresSettingsSnapshot) return

    let mounted = true
    const hydrate = async () => {
      try {
        const api = await waitForDesktopApi()
        await new Promise((resolve) => window.setTimeout(resolve, 50))
        const snapshot = await api.getSettingsSnapshot()
        if (snapshot && mounted) {
          setSettings({ ...defaultSettings, ...snapshot.settings })
          setActions(snapshot.smart_actions || [])
          setBuiltinActions(snapshot.builtin_actions || [])
          setLang((snapshot.settings?.UI_LANGUAGE || "en") as UiLanguage)
        }
      } catch {
        if (mounted) {
          setLoadError(getTranslations(lang).loadError)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    hydrate()
    return () => {
      mounted = false
    }
  }, [lang, requiresSettingsSnapshot])

  const changeLang = (newLang: UiLanguage) => {
    setLang(newLang)
    setSettings((prev) => ({ ...prev, UI_LANGUAGE: newLang }))
    window.desktopApi?.setUiLanguage(newLang)
  }

  const t = getTranslations(lang)

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">{t.appLoading}</div>
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-sm">{loadError}</div>
      </div>
    )
  }

  if (page === "popup") {
    return <PopupPage t={t} uiLang={lang} changeLang={changeLang} />
  }

  if (page === "settings") {
    return (
      <SettingsPage
        t={t}
        settings={settings}
        actions={actions}
        builtinActions={builtinActions}
        onSettingsChange={setSettings}
        onActionsChange={setActions}
        onBuiltinActionsChange={setBuiltinActions}
        onLanguageChange={changeLang}
      />
    )
  }

  if (page === "chat") {
    return <ChatPage t={t} uiLang={lang} changeLang={changeLang} />
  }

  if (page === "image_source") {
    return <ImageSourcePage t={t} uiLang={lang} changeLang={changeLang} />
  }

  return <AskPage t={t} uiLang={lang} changeLang={changeLang} />
}
