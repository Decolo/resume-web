import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getActiveProvider,
  setActiveProvider,
  getProviderSettings,
  saveProviderSettings,
  getSttLanguageSetting,
  setSttLanguageSetting,
  loadActiveSettings,
  SETTINGS_CHANGED_EVENT,
} from "./settings"

beforeEach(() => {
  localStorage.clear()
})

describe("settings", () => {
  it("defaults to gemini with empty settings", () => {
    expect(getActiveProvider()).toBe("gemini")
    expect(getProviderSettings("gemini")).toEqual({
      apiKey: "",
      baseURL: "",
      modelId: "",
    })
  })

  it("stores and retrieves per-provider settings independently", () => {
    saveProviderSettings("gemini", {
      apiKey: "AIza-gemini",
      baseURL: "",
      modelId: "gemini-2.0-flash",
    })
    saveProviderSettings("openai", {
      apiKey: "sk-openai",
      baseURL: "https://api.openai.com/v1",
      modelId: "gpt-4o",
    })

    expect(getProviderSettings("gemini")).toEqual({
      apiKey: "AIza-gemini",
      baseURL: "",
      modelId: "gemini-2.0-flash",
    })
    expect(getProviderSettings("openai")).toEqual({
      apiKey: "sk-openai",
      baseURL: "https://api.openai.com/v1",
      modelId: "gpt-4o",
    })
  })

  it("setActiveProvider persists and getActiveProvider reads it", () => {
    setActiveProvider("openai")
    expect(getActiveProvider()).toBe("openai")
  })

  it("loadActiveSettings returns active provider + its settings", () => {
    setActiveProvider("openai")
    saveProviderSettings("openai", {
      apiKey: "sk-test",
      baseURL: "https://custom.api",
      modelId: "gpt-4o-mini",
    })

    expect(loadActiveSettings()).toEqual({
      provider: "openai",
      apiKey: "sk-test",
      baseURL: "https://custom.api",
      modelId: "gpt-4o-mini",
      sttLanguage: "",
    })
  })

  it("switching providers does not leak settings between them", () => {
    saveProviderSettings("gemini", {
      apiKey: "gemini-key",
      baseURL: "",
      modelId: "",
    })
    saveProviderSettings("openai", {
      apiKey: "openai-key",
      baseURL: "https://api.openai.com/v1",
      modelId: "gpt-4o",
    })

    setActiveProvider("openai")
    expect(loadActiveSettings().apiKey).toBe("openai-key")

    setActiveProvider("gemini")
    const geminiSettings = loadActiveSettings()
    expect(geminiSettings.apiKey).toBe("gemini-key")
    expect(geminiSettings.baseURL).toBe("")
    expect(geminiSettings.sttLanguage).toBe("")
  })

  it("dispatches settings-changed event on provider or settings update", () => {
    const handler = vi.fn()
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler)

    setActiveProvider("openai")
    saveProviderSettings("openai", {
      apiKey: "sk-test",
      baseURL: "",
      modelId: "",
    })

    expect(handler).toHaveBeenCalledTimes(2)

    window.removeEventListener(SETTINGS_CHANGED_EVENT, handler)
  })

  it("falls back to gemini for invalid provider in localStorage", () => {
    localStorage.setItem("resume-agent-provider", "invalid-provider")
    expect(getActiveProvider()).toBe("gemini")
  })

  it("stores and reads stt language setting", () => {
    expect(getSttLanguageSetting()).toBe("")
    setSttLanguageSetting("zh")
    expect(getSttLanguageSetting()).toBe("zh")
  })
})
