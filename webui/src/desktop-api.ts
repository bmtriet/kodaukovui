import { invoke } from "@tauri-apps/api/core"
import type { SettingsSnapshot, SaveSnapshotResponse, ChatApiResponse, DesktopApi } from "./types"

function createTauriApi(): DesktopApi {
  return {
    submitAsk: (prompt, responseMode, contextCleared) => invoke("submit_ask", { prompt, responseMode, contextCleared }),
    cancelAsk: () => invoke("cancel_ask"),
    retakeImageForAsk: () => invoke<{ ok: boolean; error?: string }>("retake_image_for_ask"),
    getAskImageContext: () => invoke("get_ask_image_context"),
    submitPopup: (actionId) => invoke("submit_popup", { actionId }),
    cancelPopup: () => invoke("cancel_popup"),
    openSettings: () => invoke("open_settings"),
    setUiLanguage: (lang) => invoke("set_ui_language", { lang }),
    getSettingsSnapshot: () => invoke<SettingsSnapshot>("get_settings_snapshot"),
    saveSettingsSnapshot: (payload) => invoke<SaveSnapshotResponse>("save_settings_snapshot", { payload }),
    closeSettings: (saved) => invoke("close_settings", { saved }),
    getChatState: () => invoke<ChatApiResponse>("get_chat_state"),
    bootstrapChat: () => invoke<ChatApiResponse>("bootstrap_chat"),
    sendChatMessage: (prompt) => invoke<ChatApiResponse>("send_chat_message", { prompt }),
    insertLatestReply: () => invoke<{ ok: boolean; error?: string }>("insert_latest_reply"),
    closeChat: () => invoke("close_chat"),
    chooseImageSource: (source, doNotAskAgain) => invoke("choose_image_source", { source, doNotAskAgain }),
    cancelImageSource: () => invoke("cancel_image_source"),
    closeResponse: () => invoke("close_response"),
    copyResponseText: (text) => invoke<{ ok: boolean; error?: string }>("copy_response_text", { text }),
  }
}

export function installDesktopApiBridge() {
  const desktopWindow = window as Window & { desktopApi?: DesktopApi }
  if (desktopWindow.desktopApi) {
    return
  }

  desktopWindow.desktopApi = createTauriApi()
  window.dispatchEvent(new Event("desktopapiready"))
}
