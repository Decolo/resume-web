"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type ProviderName,
  getActiveProvider,
  setActiveProvider,
  getProviderSettings,
  saveProviderSettings,
} from "@/lib/settings"

const PROVIDERS = [
  { value: "gemini" as const, label: "Google Gemini", placeholder: "AIza..." },
  { value: "openai" as const, label: "OpenAI", placeholder: "sk-..." },
]

export default function SettingsPage() {
  const [provider, setProvider] = React.useState<ProviderName>("gemini")
  const [apiKey, setApiKey] = React.useState("")
  const [baseURL, setBaseURL] = React.useState("")
  const [modelId, setModelId] = React.useState("")
  const [saved, setSaved] = React.useState(false)

  // Load active provider + its settings on mount
  React.useEffect(() => {
    const p = getActiveProvider()
    setProvider(p)
    const s = getProviderSettings(p)
    setApiKey(s.apiKey)
    setBaseURL(s.baseURL)
    setModelId(s.modelId)
  }, [])

  // When switching tabs, persist current provider's settings then load the new one
  function handleProviderChange(next: ProviderName) {
    saveProviderSettings(provider, { apiKey, baseURL, modelId })
    const s = getProviderSettings(next)
    setProvider(next)
    setApiKey(s.apiKey)
    setBaseURL(s.baseURL)
    setModelId(s.modelId)
  }

  function handleSave() {
    setActiveProvider(provider)
    saveProviderSettings(provider, { apiKey, baseURL, modelId })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const currentProvider = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0]

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>
            Choose your AI provider and enter your API key. Keys are stored
            locally in your browser. Use &quot;OpenAI&quot; for any OpenAI-compatible
            API (Kimi, DeepSeek, etc.) with a custom Base URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <Button
                key={p.value}
                variant={provider === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleProviderChange(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium">
              API Key
            </label>
            <Input
              id="api-key"
              type="password"
              placeholder={currentProvider.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="base-url" className="text-sm font-medium">
              Base URL <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id="base-url"
              type="url"
              placeholder="https://api.moonshot.cn/v1"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Custom API endpoint for OpenAI-compatible providers (Kimi, DeepSeek, etc.)
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="model-id" className="text-sm font-medium">
              Model ID <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id="model-id"
              placeholder="e.g. kimi-k2.5, deepseek-chat"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the default model for the selected provider.
            </p>
          </div>

          <Button onClick={handleSave}>
            {saved ? "Saved ✓" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
