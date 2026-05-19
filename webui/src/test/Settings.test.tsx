import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPage } from '../pages/Settings'
import { getTranslations } from '../i18n'
import { defaultSettings } from '../types'

const t = getTranslations('en')

function setSettingsPage() {
  const params = new URLSearchParams()
  params.set('page', 'settings')
  params.set('uilang', 'en')
  Object.defineProperty(window, 'location', {
    value: { search: `?${params.toString()}` },
    writable: true,
  })
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSettingsPage()
  })

  it('renders settings title', () => {
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    expect(screen.getByText(t.settingsTitle)).toBeInTheDocument()
  })

  it('renders tabs: General, Provider, Action, About', () => {
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    const generalEls = screen.getAllByText(t.general)
    expect(generalEls.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(t.provider)).toBeInTheDocument()
    expect(screen.getByText(t.actionTab)).toBeInTheDocument()
    expect(screen.getByText(t.about)).toBeInTheDocument()
  })

  it('shows General tab by default', () => {
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    expect(screen.getByText(t.popupHotkey)).toBeInTheDocument()
    expect(screen.getByText(t.uiLanguage)).toBeInTheDocument()
    expect(screen.getByText(t.responseFallback)).toBeInTheDocument()
  })

  it('switches to Provider tab on click', async () => {
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByText(t.provider))
    expect(screen.getByText(t.providerLabel)).toBeInTheDocument()
  })

  it('shows About tab content', async () => {
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByText(t.about))
    expect(screen.getByText(t.aboutTitle)).toBeInTheDocument()
    expect(screen.getByText(`${t.aboutGithub}:`)).toBeInTheDocument()
    expect(screen.getByText(`${t.aboutFacebook}:`)).toBeInTheDocument()
    expect(screen.getByText(`${t.aboutEmail}:`)).toBeInTheDocument()
  })

  it('renders Save All buttons', () => {
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    const saveButtons = screen.getAllByText(t.saveAll)
    expect(saveButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('renders Add Action button in Action tab', async () => {
    const user = userEvent.setup()
    render(
      <SettingsPage
        t={t}
        settings={defaultSettings}
        actions={[]}
        builtinActions={[]}
        onSettingsChange={() => {}}
        onActionsChange={() => {}}
        onBuiltinActionsChange={() => {}}
        onLanguageChange={() => {}}
      />,
    )
    await user.click(screen.getByText(t.actionTab))
    expect(screen.getByText(t.addAction)).toBeInTheDocument()
  })
})
