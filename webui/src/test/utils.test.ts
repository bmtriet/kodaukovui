import { describe, it, expect } from 'vitest'
import { getTranslations, translations } from '../i18n'
import { parsePayload, readPageParam, readUiLangParam, createActionId, defaultSettings } from '../types'

describe('i18n', () => {
  it('has English translations', () => {
    expect(translations.en).toBeDefined()
  })

  it('has Vietnamese translations', () => {
    expect(translations.vi).toBeDefined()
  })

  it('has Chinese translations', () => {
    expect(translations.zh).toBeDefined()
  })

  it('all languages have the same keys', () => {
    const enKeys = Object.keys(translations.en).sort()
    const viKeys = Object.keys(translations.vi).sort()
    const zhKeys = Object.keys(translations.zh).sort()
    expect(enKeys).toEqual(viKeys)
    expect(enKeys).toEqual(zhKeys)
  })

  it('getTranslations returns English for unknown lang', () => {
    const t = getTranslations('fr' as any)
    expect(t).toBe(translations.en)
  })

  it('returns correct language translations', () => {
    expect(getTranslations('en').popupTitle).toBe('clipBo')
    expect(getTranslations('vi').popupTitle).toBe('clipBo')
    expect(getTranslations('zh').popupTitle).toBe('clipBo')
  })

  it('has all required new keys', () => {
    const requiredKeys = [
      'contextImagePreview',
      'contextTextPreview',
      'contextTextLineCount',
      'contextTextLineCountSingular',
      'clipboardImage',
      'screenRegion',
      'preview',
      'clearContext',
      'chatPreviewImage',
      'chatImageAlt',
      'popupHotkeyTitle',
      'aboutGithub',
      'aboutFacebook',
      'aboutEmail',
    ]
    for (const key of requiredKeys) {
      expect(translations.en).toHaveProperty(key)
      expect(translations.vi).toHaveProperty(key)
      expect(translations.zh).toHaveProperty(key)
    }
  })
})

describe('parsePayload', () => {
  it('parses valid JSON from URL query', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?payload=%7B%22hello%22%3A%22world%22%7D' },
      writable: true,
    })
    const result = parsePayload<{ hello: string }>()
    expect(result).toEqual({ hello: 'world' })
  })

  it('returns empty object when no payload param', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    const result = parsePayload()
    expect(result).toEqual({})
  })

  it('returns empty object for invalid JSON', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?payload=not-json' },
      writable: true,
    })
    const result = parsePayload()
    expect(result).toEqual({})
  })
})

describe('readPageParam', () => {
  it('returns popup for page=popup', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?page=popup' },
      writable: true,
    })
    expect(readPageParam()).toBe('popup')
  })

  it('returns ask as default for unknown', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    expect(readPageParam()).toBe('ask')
  })

  it('recognizes all page kinds', () => {
    const pages = ['popup', 'settings', 'ask', 'chat', 'image_source', 'response']
    for (const page of pages) {
      Object.defineProperty(window, 'location', {
        value: { search: `?page=${page}` },
        writable: true,
      })
      expect(readPageParam()).toBe(page)
    }
  })
})

describe('readUiLangParam', () => {
  it('returns en by default', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    expect(readUiLangParam()).toBe('en')
  })

  it('returns vi for uilang=vi', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?uilang=vi' },
      writable: true,
    })
    expect(readUiLangParam()).toBe('vi')
  })
})

describe('createActionId', () => {
  it('returns a non-empty string', () => {
    expect(createActionId()).toBeTruthy()
    expect(typeof createActionId()).toBe('string')
  })

  it('returns unique IDs', () => {
    const id1 = createActionId()
    const id2 = createActionId()
    expect(id1).not.toBe(id2)
  })
})

describe('defaultSettings', () => {
  it('has all required fields', () => {
    expect(defaultSettings.AI_PROVIDER).toBe('gemini')
    expect(defaultSettings.HOTKEY_POPUP).toBe("<ctrl>+'")
    expect(defaultSettings.UI_LANGUAGE).toBe('en')
    expect(defaultSettings.SHOW_RESPONSE_DIALOG_WHEN_NO_INPUT).toBe(true)
  })
})
