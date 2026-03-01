export type ProviderName = "gemini" | "openai"

const PROVIDER_KEY = "resume-agent-provider"

function providerKey(provider: ProviderName, field: string): string {
  return `resume-agent-${provider}-${field}`
}

export interface ProviderSettings {
  apiKey: string
  baseURL: string
  modelId: string
}

const VALID_PROVIDERS: ReadonlySet<string> = new Set<ProviderName>(["gemini", "openai"])

function isValidProvider(value: string | null): value is ProviderName {
  return value !== null && VALID_PROVIDERS.has(value)
}

export function getActiveProvider(): ProviderName {
  if (typeof localStorage === "undefined") return "gemini"
  const stored = localStorage.getItem(PROVIDER_KEY)
  return isValidProvider(stored) ? stored : "gemini"
}

/** Event name dispatched on window when settings change (same-tab). */
export const SETTINGS_CHANGED_EVENT = "resume-agent-settings-changed"

function notifySettingsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
  }
}

export function setActiveProvider(provider: ProviderName): void {
  localStorage.setItem(PROVIDER_KEY, provider)
  notifySettingsChanged()
}

export function getProviderSettings(provider: ProviderName): ProviderSettings {
  return {
    apiKey: localStorage.getItem(providerKey(provider, "api-key")) ?? "",
    baseURL: localStorage.getItem(providerKey(provider, "base-url")) ?? "",
    modelId: localStorage.getItem(providerKey(provider, "model-id")) ?? "",
  }
}

export function saveProviderSettings(
  provider: ProviderName,
  settings: ProviderSettings,
): void {
  localStorage.setItem(providerKey(provider, "api-key"), settings.apiKey)
  localStorage.setItem(providerKey(provider, "base-url"), settings.baseURL)
  localStorage.setItem(providerKey(provider, "model-id"), settings.modelId)
  notifySettingsChanged()
}

/** Load the active provider + its settings in one call. */
export function loadActiveSettings(): ProviderSettings & {
  provider: ProviderName
} {
  const provider = getActiveProvider()
  return { provider, ...getProviderSettings(provider) }
}
