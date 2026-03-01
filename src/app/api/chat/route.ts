import { NextRequest } from "next/server"
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai"
import { getModel, type ProviderName } from "@/lib/ai/providers"
import { RESUME_EXPERT_PROMPT } from "@/lib/ai/prompts"
import { makeUpdateSectionTool, resumeTools } from "@/lib/ai/tools"

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  let body: {
    messages: UIMessage[]
    provider: ProviderName
    apiKey: string
    baseURL?: string
    modelId?: string
    resume: Record<string, unknown>
  }

  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  if (!body.apiKey) {
    return new Response(
      JSON.stringify({ error: "API key is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  let currentResume = body.resume ?? {}

  const updateSection = makeUpdateSectionTool(
    () => currentResume,
    (next) => { currentResume = next },
  )

  const tools = {
    updateSection,
    ...resumeTools,
  }

  try {
    const model = getModel({
      provider: body.provider ?? "gemini",
      apiKey: body.apiKey,
      baseURL: body.baseURL,
      modelId: body.modelId,
    })

    const modelMessages = await convertToModelMessages(body.messages, { tools })

    const result = streamText({
      model,
      system: RESUME_EXPERT_PROMPT,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
    })

    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred"
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
