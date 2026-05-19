import '@testing-library/jest-dom/vitest'
import type { DesktopApi } from '../types'

function mockDesktopApi(): DesktopApi {
  return {
    submitAsk: () => {},
    cancelAsk: () => {},
    retakeImageForAsk: () => Promise.resolve({ ok: true }),
    getAskImageContext: () => Promise.resolve({ ok: true }),
    submitPopup: () => {},
    cancelPopup: () => {},
    openSettings: () => {},
    setUiLanguage: () => {},
    getSettingsSnapshot: () =>
      Promise.resolve({
        settings: {
          AI_PROVIDER: 'gemini',
          GEMINI_API_KEY: '',
          GEMINI_MODEL: 'gemini-2.5-flash-lite',
          OPENAI_API_KEY: '',
          OPENAI_MODEL: 'gpt-4o-mini',
          OPENAI_API_BASE: 'https://api.openai.com/v1',
          OLLAMA_MODEL: 'gemma4:e2b',
          OLLAMA_THINKING: false,
          OLLAMA_API_BASE: 'http://127.0.0.1:11434',
          HOTKEY_POPUP: "<ctrl>+'",
          UI_LANGUAGE: 'en',
          DEBUG: false,
          SHOW_RESPONSE_DIALOG_WHEN_NO_INPUT: true,
        },
        smart_actions: [],
        builtin_actions: [],
      }),
    saveSettingsSnapshot: () => Promise.resolve({ ok: true }),
    closeSettings: () => {},
    getChatState: () =>
      Promise.resolve({
        ok: true,
        session: {
          kind: 'ai_prompt',
          title: 'AI Chat',
          messages: [],
          latest_reply: '',
          context_hint: 'Direct AI chat',
        },
      }),
    bootstrapChat: () =>
      Promise.resolve({
        ok: true,
        session: {
          kind: 'ai_prompt',
          title: 'AI Chat',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
          ],
          latest_reply: 'Hi there!',
          context_hint: 'Direct AI chat',
        },
      }),
    sendChatMessage: () =>
      Promise.resolve({
        ok: true,
        session: {
          kind: 'ai_prompt',
          title: 'AI Chat',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
            { role: 'assistant', content: 'I am doing great!' },
          ],
          latest_reply: 'I am doing great!',
        },
      }),
    insertLatestReply: () => Promise.resolve({ ok: true }),
    closeChat: () => {},
    chooseImageSource: () => {},
    cancelImageSource: () => {},
    closeResponse: () => {},
    copyResponseText: () => Promise.resolve({ ok: true }),
  }
}

beforeEach(() => {
  window.desktopApi = mockDesktopApi()
})
