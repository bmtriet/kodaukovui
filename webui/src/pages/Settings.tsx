import { useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bot,
  Keyboard,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  CircleHelp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputField } from "../components/InputField"
import { ToggleField } from "../components/ToggleField"
import { SectionCard } from "../components/SectionCard"
import { LanguagePills } from "../components/LanguagePills"
import { BuiltinHotkeyEditor } from "../components/BuiltinHotkeyEditor"
import { SmartActionDialog } from "../components/SmartActionDialog"
import appIcon from "../assets/app-icon.png"
import type { GeneralSettings, SmartAction, BuiltinAction, UiLanguage } from "../types"
import { createEmptyAction } from "../types"
import type { EnTranslations } from "../i18n"

function ActionSwitch({ checked, onChange, onLabel, offLabel }: { checked: boolean; onChange: () => void; onLabel: string; offLabel: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`inline-flex h-7 w-14 items-center rounded-full px-1 transition ${checked ? "bg-teal-600" : "bg-slate-300"}`}
      aria-pressed={checked}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-7" : "translate-x-0"}`}
      />
      <span className="sr-only">{checked ? onLabel : offLabel}</span>
    </button>
  )
}

export function SettingsPage({
  t,
  settings,
  actions,
  builtinActions,
  onSettingsChange,
  onActionsChange,
  onBuiltinActionsChange,
  onLanguageChange,
}: {
  t: EnTranslations
  settings: GeneralSettings
  actions: SmartAction[]
  builtinActions: BuiltinAction[]
  onSettingsChange: React.Dispatch<React.SetStateAction<GeneralSettings>>
  onActionsChange: React.Dispatch<React.SetStateAction<SmartAction[]>>
  onBuiltinActionsChange: React.Dispatch<React.SetStateAction<BuiltinAction[]>>
  onLanguageChange: (newLang: UiLanguage) => void
}) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [capturingPopupHotkey, setCapturingPopupHotkey] = useState(false)
  const [editingAction, setEditingAction] = useState<SmartAction | null>(null)
  const [activeTab, setActiveTab] = useState<"general" | "provider" | "action" | "about">("general")
  const vietnameseMarksActionId = "add-vietnamese-marks"

  const updateField = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    onSettingsChange((prev) => ({ ...prev, [key]: value }))
  }

  const normalizedKeys = useMemo(() => {
    const actionKeys = actions.map((action) => action.hotkey.trim().toLowerCase())
    const builtinKeys = builtinActions.map((action) => action.hotkey.trim().toLowerCase())
    return { actionKeys, builtinKeys, all: [...actionKeys, ...builtinKeys] }
  }, [actions, builtinActions])

  const hasDuplicateKeys = normalizedKeys.all.length !== new Set(normalizedKeys.all).size
  const hasInvalidKey = normalizedKeys.all.some((key) => key.length !== 1)
  const hasBlankName = actions.some((action) => !action.name.trim())
  const hasBlankPrompt = actions.some((action) => !action.prompt.trim())
  const aiToolActions = useMemo(
    () => actions.filter((action) => action.id === vietnameseMarksActionId),
    [actions],
  )
  const smartTextActions = useMemo(
    () => actions.filter((action) => action.id !== vietnameseMarksActionId),
    [actions],
  )

  const saveAll = async () => {
    if (hasDuplicateKeys) {
      setError(t.duplicateKeys)
      return
    }
    if (hasInvalidKey) {
      setError(t.singleKey)
      return
    }
    if (hasBlankName) {
      setError(t.requiredName)
      return
    }
    if (hasBlankPrompt) {
      setError(t.requiredPrompt)
      return
    }

    setError("")
    setSaving(true)

    const payload = {
      settings: {
        ...settings,
        HOTKEY_POPUP: settings.HOTKEY_POPUP.trim(),
        UI_LANGUAGE: settings.UI_LANGUAGE,
      },
      builtin_actions: builtinActions.map((action) => ({
        ...action,
        hotkey: action.hotkey.trim().toLowerCase(),
      })),
      smart_actions: actions.map((action) => ({
        ...action,
        name: action.name.trim(),
        prompt: action.prompt.trim(),
        hotkey: action.hotkey.trim().toLowerCase(),
      })),
    }

    const response = await window.desktopApi?.saveSettingsSnapshot(JSON.stringify(payload))
    if (!response?.ok) {
      setSaving(false)
      setError(response?.error || t.saveSettingsError)
      return
    }

    onBuiltinActionsChange(response.builtin_actions || payload.builtin_actions)
    onActionsChange(response.smart_actions || payload.smart_actions)
    window.desktopApi?.closeSettings(true)
  }

  const saveDialogAction = (nextAction: SmartAction) => {
    const exists = actions.some((action) => action.id === nextAction.id)
    if (exists) {
      onActionsChange((prev) => prev.map((action) => (action.id === nextAction.id ? nextAction : action)))
    } else {
      onActionsChange((prev) => [...prev, nextAction])
    }
    setEditingAction(null)
  }

  const formatPopupHotkeyFromEvent = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key
    if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") {
      return ""
    }
    const parts: string[] = []
    if (event.ctrlKey || event.metaKey) parts.push("<ctrl>")
    if (event.altKey) parts.push("<alt>")
    if (event.shiftKey) parts.push("<shift>")
    const normalizedKey = key.length === 1 ? key.toLowerCase() : key
    if (!normalizedKey) return ""
    return `${parts.join("+")}${parts.length ? "+" : ""}${normalizedKey}`
  }

  const moveAction = (id: string, direction: -1 | 1) => {
    onActionsChange((prev) => {
      const visibleActions = prev.filter((action) => action.id !== vietnameseMarksActionId)
      const index = visibleActions.findIndex((action) => action.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= visibleActions.length) return prev

      const currentId = visibleActions[index].id
      const targetId = visibleActions[nextIndex].id
      const currentFullIndex = prev.findIndex((action) => action.id === currentId)
      const targetFullIndex = prev.findIndex((action) => action.id === targetId)
      if (currentFullIndex < 0 || targetFullIndex < 0) return prev

      const next = [...prev]
      const [item] = next.splice(currentFullIndex, 1)
      next.splice(targetFullIndex, 0, item)
      return next
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
      <div className="desktop-drag-region flex cursor-move items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <img src={appIcon} alt="clipBo" className="h-10 w-10 object-contain" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t.settingsTitle}</h2>
            <p className="text-xs text-slate-500">{t.settingsSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={settings.UI_LANGUAGE} onChange={onLanguageChange} />
          <Button size="sm" onClick={saveAll} disabled={saving} className="bg-teal-600 text-white hover:bg-teal-700">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t.saveAll}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-24">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setActiveTab("general")} className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "general" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.general}</button>
              <button onClick={() => setActiveTab("provider")} className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "provider" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.provider}</button>
              <button onClick={() => setActiveTab("action")} className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "action" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.actionTab}</button>
              <button onClick={() => setActiveTab("about")} className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "about" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.about}</button>
            </div>
          </div>
          <div className="space-y-4">
          {activeTab === "general" ? <SectionCard title={t.general} icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.uiLanguage}</label>
                <select
                  value={settings.UI_LANGUAGE}
                  onChange={(e) => updateField("UI_LANGUAGE", e.target.value as UiLanguage)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm leading-5 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="zh">中文</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.popupHotkey}</label>
                <InputField
                  value={settings.HOTKEY_POPUP}
                  readOnly
                  onFocus={() => setCapturingPopupHotkey(true)}
                  onBlur={() => setCapturingPopupHotkey(false)}
                  onKeyDown={(e) => {
                    e.preventDefault()
                    const next = formatPopupHotkeyFromEvent(e)
                    if (!next) return
                    updateField("HOTKEY_POPUP", next)
                    setCapturingPopupHotkey(false)
                    ;(e.currentTarget as HTMLInputElement).blur()
                  }}
                  placeholder={capturingPopupHotkey ? t.pressShortcut : ""}
                />
                <div className="mt-1 text-xs text-slate-500">
                  {capturingPopupHotkey ? t.waitShortcut : t.clickThenPress}
                </div>
              </div>
            </div>
            <ToggleField checked={settings.DEBUG} onChange={(value) => updateField("DEBUG", value)} label={t.debug} />
            <div className="space-y-1">
              <ToggleField
                checked={settings.SHOW_RESPONSE_DIALOG_WHEN_NO_INPUT}
                onChange={(value) => updateField("SHOW_RESPONSE_DIALOG_WHEN_NO_INPUT", value)}
                label={t.responseFallback}
              />
              <p className="px-1 text-xs text-slate-500">{t.responseFallbackHint}</p>
            </div>
          </SectionCard> : null}

          {activeTab === "provider" ? <SectionCard title={t.provider} icon={<Bot className="h-4 w-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.providerLabel}</label>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-1">
                  {(["gemini", "openai", "ollama"] as const).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => updateField("AI_PROVIDER", provider)}
                      className={`h-8 rounded-md text-sm font-medium ${
                        settings.AI_PROVIDER === provider ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {provider === "openai" ? "OpenAI" : provider === "ollama" ? "Ollama" : "Gemini"}
                    </button>
                  ))}
                </div>
              </div>
              {settings.AI_PROVIDER === "gemini" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.geminiModel}</label>
                    <InputField value={settings.GEMINI_MODEL} onChange={(e) => updateField("GEMINI_MODEL", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.geminiKey}</label>
                    <InputField type="password" value={settings.GEMINI_API_KEY} onChange={(e) => updateField("GEMINI_API_KEY", e.target.value)} />
                  </div>
                </>
              ) : null}
              {settings.AI_PROVIDER === "openai" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.openaiModel}</label>
                    <InputField value={settings.OPENAI_MODEL} onChange={(e) => updateField("OPENAI_MODEL", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.openaiKey}</label>
                    <InputField type="password" value={settings.OPENAI_API_KEY} onChange={(e) => updateField("OPENAI_API_KEY", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.openaiBase}</label>
                    <InputField value={settings.OPENAI_API_BASE} onChange={(e) => updateField("OPENAI_API_BASE", e.target.value)} />
                  </div>
                </>
              ) : null}
              {settings.AI_PROVIDER === "ollama" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.ollamaModel}</label>
                    <InputField value={settings.OLLAMA_MODEL} onChange={(e) => updateField("OLLAMA_MODEL", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.ollamaBase}</label>
                    <InputField value={settings.OLLAMA_API_BASE} onChange={(e) => updateField("OLLAMA_API_BASE", e.target.value)} />
                  </div>
                </>
              ) : null}
            </div>
            {settings.AI_PROVIDER === "ollama" ? (
              <ToggleField checked={settings.OLLAMA_THINKING} onChange={(value) => updateField("OLLAMA_THINKING", value)} label={t.ollamaThinking} />
            ) : null}
          </SectionCard> : null}

          {activeTab === "action" ? <SectionCard title={t.builtins} icon={<Bot className="h-4 w-4" />}>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t.builtinHint}
            </div>
            <div className="space-y-2">
              {aiToolActions.map((action) => (
                <div key={action.id} className="flex items-start gap-3 rounded-lg border border-teal-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(20,184,166,0.08)]">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded bg-teal-50 text-xs font-bold text-teal-700">
                    {action.hotkey.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-grow">
                    <div className="text-sm font-semibold text-slate-900">{action.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{action.prompt}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-1">
                        {action.ask_before_run ? t.askBeforeRun : t.runDirect}
                      </span>
                      {action.return_with_source ? (
                        <span className="rounded bg-slate-100 px-2 py-1">{t.returnWithSource}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <ActionSwitch
                      checked={action.enabled}
                      onChange={() =>
                        onActionsChange((prev) =>
                          prev.map((item) => (item.id === action.id ? { ...item, enabled: !item.enabled } : item)),
                        )
                      }
                      onLabel={t.on}
                      offLabel={t.off}
                    />
                    <Button variant="outline" size="icon" onClick={() => setEditingAction(action)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onActionsChange((prev) => prev.filter((item) => item.id !== action.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {builtinActions.map((action) => (
                <div key={action.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">{action.name}</div>
                    <ActionSwitch
                      checked={action.enabled}
                      onChange={() =>
                        onBuiltinActionsChange((prev) =>
                          prev.map((item) => (item.id === action.id ? { ...item, enabled: !item.enabled } : item)),
                        )
                      }
                      onLabel={t.on}
                      offLabel={t.off}
                    />
                  </div>
                  <BuiltinHotkeyEditor
                    action={action}
                    t={t}
                    onChange={(next) =>
                      onBuiltinActionsChange((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                    }
                  />
                </div>
              ))}
            </div>
          </SectionCard> : null}

          {activeTab === "action" ? <SectionCard title={t.smartActions} icon={<Keyboard className="h-4 w-4" />}>
            <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">{t.actionsHint}</p>
              <Button size="sm" onClick={() => setEditingAction(createEmptyAction())}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.addAction}
              </Button>
            </div>

            <div className="space-y-2">
              {smartTextActions.map((action, index) => (
                <div key={action.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-700">
                    {action.hotkey.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-grow">
                    <div className="text-sm font-semibold text-slate-900">{action.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{action.prompt}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-1">
                        {action.ask_before_run ? t.askBeforeRun : t.runDirect}
                      </span>
                      {action.return_with_source ? (
                        <span className="rounded bg-slate-100 px-2 py-1">{t.returnWithSource}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <ActionSwitch
                      checked={action.enabled}
                      onChange={() =>
                        onActionsChange((prev) =>
                          prev.map((item) => (item.id === action.id ? { ...item, enabled: !item.enabled } : item)),
                        )
                      }
                      onLabel={t.on}
                      offLabel={t.off}
                    />
                    <Button variant="outline" size="icon" onClick={() => moveAction(action.id, -1)} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => moveAction(action.id, 1)} disabled={index === smartTextActions.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setEditingAction(action)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onActionsChange((prev) => prev.filter((item) => item.id !== action.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard> : null}

          {activeTab === "about" ? (
            <SectionCard title={t.aboutTitle} icon={<CircleHelp className="h-4 w-4" />}>
              <div className="space-y-2 text-sm text-slate-700">
                <p><span className="font-semibold">{t.authorLabel}:</span> Triết Bùi</p>
                <p><span className="font-semibold">{t.aboutGithub}:</span> <a className="text-teal-700 underline" href="https://github.com/bmtriet/clipBo">github.com/bmtriet/clipBo</a></p>
                <p><span className="font-semibold">{t.aboutFacebook}:</span> <a className="text-teal-700 underline" href="https://fb.me/trietbui89">fb.me/trietbui89</a></p>
                <p><span className="font-semibold">{t.aboutEmail}:</span> <a className="text-teal-700 underline" href="mailto:minhtrietbui@live.com">minhtrietbui@live.com</a></p>
                <p className="text-xs text-slate-500">{t.aboutContributeHint}</p>
              </div>
            </SectionCard>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            {error ? (
              <span className="flex items-center gap-2 font-medium text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            ) : (
              t.savedHint
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white/95 px-5 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.06)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="text-sm text-slate-500">{error ? error : t.settingsSaveHint}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveAll} disabled={saving} className="bg-teal-600 text-white hover:bg-teal-700">
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {t.saveAll}
            </Button>
          </div>
        </div>
      </div>

      {editingAction ? (
        <SmartActionDialog
          t={t}
          initialAction={editingAction}
          onClose={() => setEditingAction(null)}
          onSave={saveDialogAction}
        />
      ) : null}
    </div>
  )
}
