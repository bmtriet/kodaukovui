import { InputField } from "./InputField"
import type { BuiltinAction } from "../types"

export function BuiltinHotkeyEditor({
  action,
  onChange,
}: {
  action: BuiltinAction
  onChange: (next: BuiltinAction) => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 md:grid-cols-[1fr_120px]">
      <div>
        <div className="text-sm font-semibold text-slate-900">{action.name}</div>
        <div className="text-xs text-slate-500">
          {action.kind === "ai_prompt"
            ? "Reserved built-in AI text discussion flow."
            : "Reserved built-in image discussion flow."}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Hotkey</label>
        <InputField
          maxLength={1}
          value={action.hotkey}
          onChange={(e) => onChange({ ...action, hotkey: e.target.value.toLowerCase() })}
        />
      </div>
    </div>
  )
}
