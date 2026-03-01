import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getActiveProvider,
  setActiveProvider,
  getProviderSettings,
  saveProviderSettings,
  loadActiveSettings,
  SETTINGS_CHANGED_EVENT,
} from "./settings"

// vitest env is "node" but we need localStorage + window — use simple shims
const store = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  },
  writable: true,
})

// Minimal window shim for event dispatching
if (typeof window === "undefined") {
  const listeners = new Map<string, Set<() => void>>()
  ;(globalThis as unknown as { window: unknown }).window = {
    dispatchEvent(event: { type: string }) {
      for (const fn of listeners.get(event.type) ?? []) fn()
    },
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn)
    },
  }
}

beforeEach(() => store.clear())

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

    // Simulate switching to openai
    setActiveProvider("openai")
    const openaiSettings = loadActiveSettings()
    expect(openaiSettings.apiKey).toBe("openai-key")

    // Switch back to gemini
    setActiveProvider("gemini")
    const geminiSettings = loadActiveSettings()
    expect(geminiSettings.apiKey).toBe("gemini-key")
    expect(geminiSettings.baseURL).toBe("")
  })

  it("dispatches settings-changed event on setActiveProvider and saveProviderSettings", () => {
    const handler = vi.fn()
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler)

    setActiveProvider("openai")
    expect(handler).toHaveBeenCalledTimes(1)

    saveProviderSettings("openai", {
      apiKey: "sk-test",
      baseURL: "",
      modelId: "",
    })
    expect(handler).toHaveBeenCalledTimes(2)

    window.removeEventListener(SETTINGS_CHANGED_EVENT, handler)
  })

  it("falls back to gemini for invalid provider in localStorage", () => {
    store.set("resume-agent-provider", "invalid-provider")
    expect(getActiveProvider()).toBe("gemini")
  })
})
