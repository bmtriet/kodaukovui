import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AskPage } from '../pages/Ask'
import { getTranslations } from '../i18n'
import type { AskPayload } from '../types'

const t = getTranslations('en')

function setAskPayload(payload: AskPayload) {
  const params = new URLSearchParams()
  params.set('page', 'ask')
  params.set('uilang', 'en')
  params.set('payload', JSON.stringify(payload))
  Object.defineProperty(window, 'location', {
    value: { search: `?${params.toString()}` },
    writable: true,
  })
}

describe('AskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('prompt_only mode', () => {
    beforeEach(() => {
      setAskPayload({
        title: 'AI Prompt',
        placeholder: 'Ask AI anything...',
        responseModeEnabled: true,
        defaultResponseMode: 'chat',
        contextMode: 'prompt_only',
        imageContextAvailable: false,
      })
    })

    it('renders title and placeholder', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText('AI Prompt')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Ask AI anything...')).toBeInTheDocument()
    })

    it('shows Prompt only badge', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(t.contextPromptOnly)).toBeInTheDocument()
    })

    it('does not show text context card', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.queryByText(t.contextTextPreview)).not.toBeInTheDocument()
    })

    it('sends submitAsk on Enter', async () => {
      const submitSpy = vi.fn()
      window.desktopApi = { ...window.desktopApi!, submitAsk: submitSpy } as any
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)

      const user = userEvent.setup()
      const textarea = screen.getByPlaceholderText('Ask AI anything...')
      await user.type(textarea, 'Hello AI')
      await user.keyboard('{Enter}')
      expect(submitSpy).toHaveBeenCalledWith('Hello AI', 'chat', false)
    })

    it('cancels on Escape', async () => {
      const cancelSpy = vi.fn()
      window.desktopApi = { ...window.desktopApi!, cancelAsk: cancelSpy } as any
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)

      const user = userEvent.setup()
      const textarea = screen.getByPlaceholderText('Ask AI anything...')
      await user.type(textarea, 'test')
      await user.keyboard('{Escape}')
      expect(cancelSpy).toHaveBeenCalled()
    })

    it('renders response mode selector', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(t.responsePaste)).toBeInTheDocument()
      expect(screen.getByText(t.responseChat)).toBeInTheDocument()
    })
  })

  describe('selected_text mode', () => {
    beforeEach(() => {
      setAskPayload({
        title: 'AI Prompt',
        placeholder: 'Enter your request for the selected text...',
        responseModeEnabled: true,
        defaultResponseMode: 'chat',
        contextMode: 'selected_text',
        imageContextAvailable: false,
        selectedText: 'The quick brown fox jumps over the lazy dog.',
      })
    })

    it('shows text context preview card', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(t.contextTextPreview)).toBeInTheDocument()
    })

    it('shows line count in preview', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(/1/)).toBeInTheDocument()
    })

    it('shows text snippet in preview', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(/The quick brown fox/)).toBeInTheDocument()
    })

    it('has Clear context button', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(t.clearContext)).toBeInTheDocument()
    })

    it('hides text context card after clicking Clear', async () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      const user = userEvent.setup()
      await user.click(screen.getByText(t.clearContext))
      expect(screen.queryByText(t.contextTextPreview)).not.toBeInTheDocument()
    })

    it('passes contextCleared=true in submitAsk after clearing', async () => {
      const submitSpy = vi.fn()
      window.desktopApi = { ...window.desktopApi!, submitAsk: submitSpy } as any
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)

      const user = userEvent.setup()
      await user.click(screen.getByText(t.clearContext))
      const textarea = screen.getByPlaceholderText('Enter your request for the selected text...')
      await user.type(textarea, 'Translate this')
      await user.keyboard('{Enter}')
      expect(submitSpy).toHaveBeenCalledWith('Translate this', 'chat', true)
    })

    it('shows Selected text badge initially', () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      expect(screen.getByText(t.contextSelectedText)).toBeInTheDocument()
    })

    it('switches badge to Prompt only after clearing context', async () => {
      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)
      const user = userEvent.setup()
      await user.click(screen.getByText(t.clearContext))
      expect(screen.getByText(t.contextPromptOnly)).toBeInTheDocument()
    })
  })

  describe('image context', () => {
    it('shows image context when imageContextAvailable is set', async () => {
      // Pre-set the image mock response
      window.desktopApi = {
        ...window.desktopApi!,
        getAskImageContext: () =>
          Promise.resolve({
            ok: true,
            image_payload: {
              source: 'clipboard_image',
              mime_type: 'image/png',
              image_base64: 'iVBORw0KGgo=', // minimal valid base64
              size: { width: 100, height: 100 },
            },
          }),
      } as any

      setAskPayload({
        title: 'Ask by Image',
        placeholder: 'Ask about this image...',
        responseModeEnabled: true,
        defaultResponseMode: 'chat',
        contextMode: 'prompt_only',
        imageContextAvailable: true,
      })

      render(<AskPage t={t} uiLang="en" changeLang={() => {}} />)

      // Image loads async via useEffect
      expect(await screen.findByText(t.contextImagePreview)).toBeInTheDocument()
    })
  })
})
