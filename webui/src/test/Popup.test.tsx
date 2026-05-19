import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PopupPage } from '../pages/Popup'
import { getTranslations } from '../i18n'
import type { PopupPayload } from '../types'

const t = getTranslations('en')

function setPopupPayload(payload: PopupPayload) {
  const params = new URLSearchParams()
  params.set('page', 'popup')
  params.set('uilang', 'en')
  params.set('payload', JSON.stringify(payload))
  Object.defineProperty(window, 'location', {
    value: { search: `?${params.toString()}` },
    writable: true,
  })
}

function mockPayload(overrides: Partial<PopupPayload> = {}): PopupPayload {
  return {
    context: {
      has_selected_text: true,
      has_clipboard_image: false,
      has_clipboard_text: false,
    },
    sections: [
      {
        id: 'quick_translate',
        items: [
          { id: 'translate-to-english', label: 'Translate to English', short_label: 'English', shortcut: 'e', category: 'translate', context_tags: ['selectedText'], priority_base: 30, run_mode: 'direct', is_builtin: false, ask_before_run: false, return_with_source: false },
          { id: 'translate-to-vietnamese', label: 'Translate to Vietnamese', short_label: 'Vietnamese', shortcut: 'v', category: 'translate', context_tags: ['selectedText'], priority_base: 20, run_mode: 'direct', is_builtin: false, ask_before_run: false, return_with_source: false },
          { id: 'translate-to-zh-tw', label: 'Translate to Chinese', short_label: 'Chinese', shortcut: 'z', category: 'translate', context_tags: ['selectedText'], priority_base: 10, run_mode: 'direct', is_builtin: false, ask_before_run: false, return_with_source: false },
          { id: 'translate-to-khmer', label: 'Translate to Khmer', short_label: 'Khmer', shortcut: 'k', category: 'translate', context_tags: ['selectedText'], priority_base: 0, run_mode: 'direct', is_builtin: false, ask_before_run: false, return_with_source: false },
        ],
      },
      {
        id: 'ai_tools',
        items: [
          { id: 'ai_prompt', label: 'AI Prompt', shortcut: 'a', category: 'ai', context_tags: ['general'], priority_base: 30, run_mode: 'prompt', kind: 'ai_prompt', is_builtin: true, ask_before_run: false, return_with_source: false },
          { id: 'image_ask', label: 'Ask by Image', shortcut: 'i', category: 'image', context_tags: ['general'], priority_base: 20, run_mode: 'prompt', kind: 'image_ask', is_builtin: true, ask_before_run: false, return_with_source: false },
        ],
      },
      {
        id: 'text_tools',
        items: [
          { id: 'add-vietnamese-marks', label: 'Add Vietnamese Marks', shortcut: '1', category: 'text', context_tags: ['selectedText'], priority_base: 45, run_mode: 'direct', is_builtin: false, ask_before_run: false, return_with_source: false },
        ],
      },
    ],
    ...overrides,
  }
}

describe('PopupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders popup title and header', () => {
    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByText(t.popupTitle)).toBeInTheDocument()
  })

  it('renders Quick Translate section with 4 language buttons', () => {
    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByText(t.quickTranslate)).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.getByText('Vietnamese')).toBeInTheDocument()
    expect(screen.getByText('Chinese')).toBeInTheDocument()
    expect(screen.getByText('Khmer')).toBeInTheDocument()
  })

  it('renders AI Tools section', () => {
    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByText(t.popupAiTools)).toBeInTheDocument()
    expect(screen.getByText('AI Prompt')).toBeInTheDocument()
    expect(screen.getByText('Ask by Image')).toBeInTheDocument()
  })

  it('renders Text Tools section', () => {
    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByText(t.popupTextTools)).toBeInTheDocument()
    expect(screen.getByText('Add Vietnamese Marks')).toBeInTheDocument()
  })

  it('calls submitPopup when clicking a translate button', async () => {
    const submitSpy = vi.fn()
    window.desktopApi = { ...window.desktopApi!, submitPopup: submitSpy } as any

    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)

    const user = userEvent.setup()
    await user.click(screen.getByText('English'))
    expect(submitSpy).toHaveBeenCalledWith('translate-to-english')
  })

  it('calls submitPopup when pressing a shortcut key', async () => {
    const submitSpy = vi.fn()
    window.desktopApi = { ...window.desktopApi!, submitPopup: submitSpy } as any

    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)

    const user = userEvent.setup()
    await user.keyboard('e')
    expect(submitSpy).toHaveBeenCalledWith('translate-to-english')
  })

  it('calls cancelPopup on Escape key', async () => {
    const cancelSpy = vi.fn()
    window.desktopApi = { ...window.desktopApi!, cancelPopup: cancelSpy } as any

    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)

    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('renders with no sections gracefully', () => {
    setPopupPayload(mockPayload({ sections: [] }))
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByText(t.popupTitle)).toBeInTheDocument()
  })

  it('renders settings and close buttons', () => {
    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByLabelText(t.openSettings)).toBeInTheDocument()
    expect(screen.getByLabelText(t.closePopup)).toBeInTheDocument()
  })

  it('shows about dialog when clicking about button', async () => {
    setPopupPayload(mockPayload())
    render(<PopupPage t={t} uiLang="en" changeLang={() => {}} />)

    const user = userEvent.setup()
    await user.click(screen.getByLabelText(t.about))
    expect(screen.getByText(t.aboutTitle)).toBeInTheDocument()
  })
})
