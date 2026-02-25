/**
 * Multi-provider AI configuration using Vercel AI SDK.
 *
 * Supports Gemini (native) and any OpenAI-compatible provider
 * (OpenAI, Kimi/Moonshot, DeepSeek, etc.) via custom baseURL.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export type ProviderName = "gemini" | "openai";

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  baseURL?: string;
  modelId?: string;
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o",
};

/**
 * Return an AI SDK LanguageModel for the given provider config.
 *
 * For OpenAI-compatible providers (Kimi, DeepSeek, etc.),
 * pass a custom `baseURL` and `modelId`.
 */
export function getModel(config: ProviderConfig) {
  const id = config.modelId ?? DEFAULT_MODELS[config.provider];

  switch (config.provider) {
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        ...(config.baseURL && { baseURL: config.baseURL }),
      });
      return google(id);
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL && { baseURL: config.baseURL }),
      });
      // Use .chat() to hit /chat/completions (not /responses)
      // which is what OpenAI-compatible providers (Kimi, DeepSeek, etc.) support
      return openai.chat(id);
    }
  }
}
