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
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputField } from "../components/InputField"
import { ToggleField } from "../components/ToggleField"
import { SectionCard } from "../components/SectionCard"
import { LanguagePills } from "../components/LanguagePills"
import { BuiltinHotkeyEditor } from "../components/BuiltinHotkeyEditor"
import { SmartActionDialog } from "../components/SmartActionDialog"
import type { GeneralSettings, SmartAction, BuiltinAction, UiLanguage } from "../types"
import { createEmptyAction } from "../types"
import type { EnTranslations } from "../i18n"

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
  const [editingAction, setEditingAction] = useState<SmartAction | null>(null)

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
      setError(response?.error || "Failed to save settings.")
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

  const moveAction = (id: string, direction: -1 | 1) => {
    onActionsChange((prev) => {
      const index = prev.findIndex((action) => action.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
      <div className="desktop-drag-region flex cursor-move items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t.settingsTitle}</h2>
            <p className="text-xs text-slate-500">{t.settingsSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguagePills currentLang={settings.UI_LANGUAGE} onChange={onLanguageChange} />
          <Button variant="outline" size="sm" onClick={() => window.desktopApi?.closeSettings(false)}>
            {t.close}
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t.saveAll}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-6xl space-y-4">
          <SectionCard title={t.general} icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.uiLanguage}</label>
                <select
                  value={settings.UI_LANGUAGE}
                  onChange={(e) => updateField("UI_LANGUAGE", e.target.value as UiLanguage)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="zh">中文</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.popupHotkey}</label>
                <InputField value={settings.HOTKEY_POPUP} onChange={(e) => updateField("HOTKEY_POPUP", e.target.value)} />
              </div>
            </div>
            <ToggleField checked={settings.DEBUG} onChange={(value) => updateField("DEBUG", value)} label={t.debug} />
          </SectionCard>

          <SectionCard title={t.provider} icon={<Bot className="h-4 w-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.providerLabel}</label>
                <select
                  value={settings.AI_PROVIDER}
                  onChange={(e) => updateField("AI_PROVIDER", e.target.value as "gemini" | "openai")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.geminiModel}</label>
                <InputField value={settings.GEMINI_MODEL} onChange={(e) => updateField("GEMINI_MODEL", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.geminiKey}</label>
                <InputField type="password" value={settings.GEMINI_API_KEY} onChange={(e) => updateField("GEMINI_API_KEY", e.target.value)} />
              </div>
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
            </div>
          </SectionCard>

          <SectionCard title={t.builtins} icon={<Bot className="h-4 w-4" />}>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t.builtinHint}
            </div>
            <div className="space-y-2">
              {builtinActions.map((action) => (
                <BuiltinHotkeyEditor
                  key={action.id}
                  action={action}
                  onChange={(next) =>
                    onBuiltinActionsChange((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                  }
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t.smartActions} icon={<Keyboard className="h-4 w-4" />}>
            <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">{t.actionsHint}</p>
              <Button size="sm" onClick={() => setEditingAction(createEmptyAction())}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.addAction}
              </Button>
            </div>

            <div className="space-y-2">
              {actions.map((action, index) => (
                <div key={action.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-700">
                    {action.hotkey.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-grow">
                    <div className="text-sm font-semibold text-slate-900">{action.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{action.prompt}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-1">
                        {action.ask_before_run ? t.askBeforeRun : "Run direct"}
                      </span>
                      {action.return_with_source ? (
                        <span className="rounded bg-slate-100 px-2 py-1">{t.returnWithSource}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" onClick={() => moveAction(action.id, -1)} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => moveAction(action.id, 1)} disabled={index === actions.length - 1}>
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
          </SectionCard>

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
