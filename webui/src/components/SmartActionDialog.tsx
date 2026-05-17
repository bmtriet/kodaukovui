import { useEffect, useState } from "react"
import { AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ToggleField } from "./ToggleField"
import { InputField } from "./InputField"
import type { SmartAction } from "../types"
import { isEditableTarget, isImeComposing } from "../types"
import type { EnTranslations } from "../i18n"

export function SmartActionDialog({
  t,
  initialAction,
  onClose,
  onSave,
}: {
  t: EnTranslations
  initialAction: SmartAction
  onClose: () => void
  onSave: (action: SmartAction) => void
}) {
  const [draft, setDraft] = useState<SmartAction>({ ...initialAction })
  const [error, setError] = useState("")

  const submit = () => {
    const hotkey = draft.hotkey.trim().toLowerCase()
    if (!draft.name.trim()) {
      setError(t.requiredName)
      return
    }
    if (!draft.prompt.trim()) {
      setError(t.requiredPrompt)
      return
    }
    if (hotkey.length !== 1) {
      setError(t.singleKey)
      return
    }
    onSave({
      ...draft,
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      hotkey,
    })
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isImeComposing(e) || isEditableTarget(e.target)) return
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {initialAction.name ? t.actionDialogEdit : t.actionDialogCreate}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 md:grid-cols-[1fr_120px]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.name}</label>
              <InputField value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.hotkey}</label>
              <InputField
                maxLength={1}
                value={draft.hotkey}
                onChange={(e) => setDraft((prev) => ({ ...prev, hotkey: e.target.value.toLowerCase() }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.prompt}</label>
            <Textarea
              value={draft.prompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              className="min-h-40 bg-white"
            />
          </div>
          <ToggleField
            checked={draft.ask_before_run}
            onChange={(value) => setDraft((prev) => ({ ...prev, ask_before_run: value }))}
            label={t.askBeforeRun}
          />
          <ToggleField
            checked={draft.return_with_source}
            onChange={(value) => setDraft((prev) => ({ ...prev, return_with_source: value }))}
            label={t.returnWithSource}
          />
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={submit}>{t.save}</Button>
        </div>
      </div>
    </div>
  )
}
