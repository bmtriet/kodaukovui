import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChatPage } from '../pages/Chat'
import { getTranslations } from '../i18n'

const t = getTranslations('en')

function setChatPage() {
  const params = new URLSearchParams()
  params.set('page', 'chat')
  params.set('uilang', 'en')
  Object.defineProperty(window, 'location', {
    value: { search: `?${params.toString()}` },
    writable: true,
  })
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setChatPage()
  })

  it('shows loading state initially', () => {
    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)
    expect(screen.getByText(t.chatLoading)).toBeInTheDocument()
  })

  it('renders chat messages after bootstrap', async () => {
    window.desktopApi = {
      ...window.desktopApi!,
      getChatState: () =>
        Promise.resolve({
          ok: true,
          session: {
            kind: 'ai_prompt',
            title: 'AI Chat',
            messages: [
              { role: 'user', content: 'Hello world' },
              { role: 'assistant', content: 'Hi there! How can I help?' },
            ],
            latest_reply: 'Hi there! How can I help?',
          },
        }),
      bootstrapChat: () =>
        Promise.resolve({
          ok: true,
          session: {
            kind: 'ai_prompt',
            title: 'AI Chat',
            messages: [
              { role: 'user', content: 'Hello world' },
              { role: 'assistant', content: 'Hi there! How can I help?' },
            ],
            latest_reply: 'Hi there! How can I help?',
          },
        }),
    } as any

    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })
    expect(screen.getByText('Hi there! How can I help?')).toBeInTheDocument()
  })

  it('renders user and AI role labels', async () => {
    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)

    await waitFor(() => {
      expect(screen.queryByText(t.chatLoading)).not.toBeInTheDocument()
    })
    expect(screen.getAllByText(t.chatRoleYou)[0]).toBeInTheDocument()
    expect(screen.getAllByText(t.chatRoleAi)[0]).toBeInTheDocument()
  })

  it('renders chat title', async () => {
    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('AI Chat')).toBeInTheDocument()
    })
  })

  it('renders Insert Latest Reply and Send buttons', async () => {
    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(t.insertLatestReply)).toBeInTheDocument()
    })
    expect(screen.getByText(t.send)).toBeInTheDocument()
  })

  it('has textarea for typing messages', async () => {
    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(t.chatPlaceholder)).toBeInTheDocument()
    })
  })

  it('renders close button', async () => {
    render(<ChatPage t={t} uiLang="en" changeLang={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(t.close)).toBeInTheDocument()
    })
  })
})
