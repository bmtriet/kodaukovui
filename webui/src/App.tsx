import { useEffect, useState, useRef } from "react"
import { Send, X, MessageCircle, Type, Languages, Globe, Sparkles, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

declare global {
  interface Window {
    pywebview?: {
      api: {
        submitQa: (prompt: string, lang: string) => void;
        cancelQa: () => void;
        submitPopup: (action: string) => void;
        cancelPopup: () => void;
      }
    }
  }
}

function QaUi() {
  const [prompt, setPrompt] = useState("")
  const [lang, setLang] = useState("Auto")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.pywebview?.api.cancelQa()
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [prompt, lang])

  const submit = () => {
    window.pywebview?.api.submitQa(prompt.trim(), lang)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50/95 backdrop-blur-md text-slate-900 p-4 font-sans overflow-hidden rounded-xl border border-slate-200/50 shadow-2xl">
      <div className="pywebview-drag-region flex items-center justify-between mb-3 px-1 cursor-move">
        <h2 className="text-sm font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-600" />
          Hỏi đáp AI (Prompt)
        </h2>
        <div className="flex gap-1">
          <button onClick={() => window.pywebview?.api.cancelQa()} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-grow relative mb-4">
        <Textarea 
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Nhập câu hỏi hoặc yêu cầu của bạn (Bấm Enter để gửi)..."
          className="w-full h-full resize-none bg-white border-slate-200 focus-visible:ring-teal-500 focus-visible:border-teal-500 text-sm p-3 shadow-inner rounded-lg"
        />
        <div className="absolute bottom-2 right-2 text-xs text-slate-400 select-none bg-white/80 px-1 rounded">
          {prompt.length}/2000
        </div>
      </div>
      
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600 px-1">Ngôn ngữ trả lời:</label>
          <Select value={lang} onValueChange={(v) => { if (v) setLang(v) }}>
            <SelectTrigger className="w-[130px] h-9 bg-white border-slate-200 focus:ring-teal-500 text-sm shadow-sm">
              <SelectValue placeholder="Ngôn ngữ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Auto">🌐 Auto</SelectItem>
              <SelectItem value="VI">🇻🇳 VI</SelectItem>
              <SelectItem value="EN">🇬🇧 EN</SelectItem>
              <SelectItem value="ZH-tw">🇹🇼 ZH-tw</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.pywebview?.api.cancelQa()} className="border-slate-200 hover:bg-slate-100 text-sm h-9 px-3">
            Hủy (ESC)
          </Button>
          <Button onClick={submit} className="bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-sm h-9 px-4 shadow-md transition-all hover:shadow-lg">
            <Send className="w-4 h-4 mr-1.5" />
            Gửi nhanh
          </Button>
        </div>
      </div>
    </div>
  )
}

const POPUP_OPTIONS = [
  { num: "1", label: "Thêm dấu tiếng Việt", icon: Type, action: "add_marks", color: "text-blue-600", bg: "bg-blue-50" },
  { num: "2", label: "Dịch sang Tiếng Anh", icon: Languages, action: "trans_en", color: "text-green-600", bg: "bg-green-50" },
  { num: "3", label: "Dịch sang Tiếng Hoa Phồn thể", icon: Globe, action: "trans_zhtw", color: "text-orange-600", bg: "bg-orange-50" },
  { num: "4", label: "Dịch sang Tiếng Khmer", icon: Globe, action: "trans_khmer", color: "text-purple-600", bg: "bg-purple-50" },
  { num: "5", label: "Dịch sang Tiếng Việt", icon: Globe, action: "trans_vi", color: "text-red-600", bg: "bg-red-50" },
  { num: "6", label: "Hỏi đáp AI", icon: MessageCircle, action: "qa", color: "text-teal-600", bg: "bg-teal-50" },
]

function PopupUi() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.pywebview?.api.cancelPopup()
      }
      const opt = POPUP_OPTIONS.find(o => o.num === e.key)
      if (opt) {
        window.pywebview?.api.submitPopup(opt.action)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-slate-50/95 backdrop-blur-md font-sans select-none border border-slate-200/50 shadow-2xl rounded-xl overflow-hidden">
      <div className="pywebview-drag-region flex items-center p-4 bg-white/50 border-b border-slate-200/50 cursor-move">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-100 to-blue-100 flex items-center justify-center mr-3 shadow-inner">
          <Sparkles className="w-4 h-4 text-teal-600" />
        </div>
        <div className="flex-grow">
          <h2 className="text-sm font-bold text-slate-800">Chọn chức năng</h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">KoDauKoVui Assistant</p>
        </div>
        <button onClick={() => window.pywebview?.api.cancelPopup()} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-grow overflow-y-auto py-2 px-2 bg-white/80">
        {POPUP_OPTIONS.map((opt) => (
          <div 
            key={opt.num}
            onClick={() => window.pywebview?.api.submitPopup(opt.action)}
            className="flex items-center px-3 py-2.5 mb-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-all group hover:shadow-sm"
          >
            <div className="w-6 h-6 rounded flex items-center justify-center bg-white border border-slate-200 text-slate-500 font-bold text-xs mr-3 shadow-sm group-hover:border-teal-300 group-hover:text-teal-600 transition-colors">
              {opt.num}
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${opt.bg}`}>
              <opt.icon className={`w-4 h-4 ${opt.color}`} />
            </div>
            <span className="flex-grow text-sm font-medium text-slate-700 group-hover:text-slate-900">{opt.label}</span>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transform group-hover:translate-x-1 transition-all" />
          </div>
        ))}
      </div>
      
      <div className="p-3 bg-slate-100/50 border-t border-slate-200/50 text-center">
        <p className="text-[11px] text-slate-500 font-medium">Bấm phím 1–6 để chọn nhanh, hoặc ESC để hủy.</p>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState("qa")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("page") === "popup") {
      setPage("popup")
    }
  }, [])

  if (page === "popup") return <PopupUi />
  return <QaUi />
}
