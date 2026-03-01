import { test, expect } from "@playwright/test"

// Minimal streaming response that simulates AI calling updateSection
// Wire format: SSE, each chunk is `data: <json>\n\n`
function makeApprovalStream(toolCallId: string, approvalId: string) {
  const chunks = [
    { type: "text-start", id: "txt-1" },
    { type: "text-delta", id: "txt-1", delta: "I'll update your name." },
    { type: "text-end", id: "txt-1" },
    { type: "tool-input-start", toolCallId, toolName: "updateSection" },
    {
      type: "tool-input-available",
      toolCallId,
      toolName: "updateSection",
      input: { path: "basics.name", value: "Jane Smith" },
    },
    { type: "tool-approval-request", approvalId, toolCallId },
  ]

  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")

  return {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body,
  }
}

function makeOutputStream(toolCallId: string) {
  const chunks = [
    {
      type: "tool-output-available",
      toolCallId,
      output: { success: true, path: "basics.name", updatedValue: "Jane Smith" },
    },
  ]

  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")

  return {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body,
  }
}

test.describe("tool approval flow", () => {
  test("shows approval card and updates resume on accept", async ({ page }) => {
    const toolCallId = "tc-1"
    const approvalId = "ap-1"
    let requestCount = 0

    // Set API key before navigating so the app thinks we're configured
    await page.goto("/sessions")
    await page.evaluate(() => {
      localStorage.setItem("resume-agent-gemini-api-key", "test-key")
      localStorage.setItem("resume-agent-provider", "gemini")
    })

    // Create a new session — click "New Session" button
    await page.getByRole("button", { name: /new session/i }).first().click()

    // Wait for navigation to session page (URL changes to /sessions/<id>)
    await page.waitForURL(/\/sessions\/[a-zA-Z0-9-]+/)

    // Mock /api/chat: first request returns approval-requested, second returns output
    await page.route("**/api/chat", (route) => {
      requestCount++
      if (requestCount === 1) {
        route.fulfill(makeApprovalStream(toolCallId, approvalId))
      } else {
        route.fulfill(makeOutputStream(toolCallId))
      }
    })

    // The session page should show the empty state or chat input
    // Chat input appears after the empty state actions or directly
    // Try "Create from scratch" to get past empty state
    const createNewBtn = page.getByRole("button", { name: /create.*new|from scratch|start/i })
    if (await createNewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createNewBtn.click()
    }

    // Now the chat input should be visible
    const input = page.getByPlaceholder(/ask about your resume/i)
    await expect(input).toBeVisible({ timeout: 5000 })

    await input.fill("Update my name to Jane Smith")
    // The input uses Cmd+Enter to send
    await input.press("Meta+Enter")

    // Approval card should appear
    await expect(page.getByText("Approval needed")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("basics.name")).toBeVisible()

    // Click Accept
    await page.getByRole("button", { name: /accept/i }).click()

    // Resume should update — check the diff tab shows the new value
    await page.getByRole("tab", { name: /changes/i }).click()
    await expect(page.getByText("Jane Smith", { exact: true }).first()).toBeVisible({ timeout: 5000 })
  })
})
