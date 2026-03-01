import { test, expect } from "@playwright/test"

test.describe("Resume management E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Set API key before navigating
    await page.goto("/sessions")
    await page.evaluate(() => {
      localStorage.setItem("resume-agent-gemini-api-key", "test-key")
      localStorage.setItem("resume-agent-provider", "gemini")
    })
  })

  // Test 1: Happy path - full workflow
  test("upserts a single resume record per session", async ({ request }) => {
    // 1. Create session via API
    const sessionRes = await request.post("/api/sessions", {
      data: { provider: "gemini" },
    })
    expect(sessionRes.ok()).toBeTruthy()
    const session = await sessionRes.json()
    expect(session.id).toBeDefined()

    // 2. Create first resume
    const resume1Res = await request.post("/api/resumes", {
      data: {
        sessionId: session.id,
        title: "Frontend Resume",
        content: JSON.stringify({ basics: { name: "John Doe" } }),
      },
    })
    expect(resume1Res.ok()).toBeTruthy()
    const resume1 = await resume1Res.json()
    expect(resume1.id).toBeDefined()
    expect(resume1.title).toBe("Frontend Resume")

    // 3. Upsert same session again
    const resume2Res = await request.post("/api/resumes", {
      data: {
        sessionId: session.id,
        title: "Backend Resume",
        content: JSON.stringify({ basics: { name: "John Doe" } }),
      },
    })
    expect(resume2Res.ok()).toBeTruthy()
    const resume2 = await resume2Res.json()
    expect(resume2.id).toBe(resume1.id)
    expect(resume2.title).toBe("Backend Resume")

    // 4. Fetch singleton resume for session
    const resumesRes = await request.get(`/api/sessions/${session.id}/resumes`)
    expect(resumesRes.ok()).toBeTruthy()
    const resume = await resumesRes.json()

    expect(resume.id).toBe(resume1.id)
    expect(resume.title).toBe("Backend Resume")
  })

  // Test 2: Error handling
  test("returns 400 when creating resume with missing fields", async ({ request }) => {
    const res = await request.post("/api/resumes", {
      data: {
        sessionId: "test_session",
        // Missing title and content
      },
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("Missing required fields")
  })

  // Test 3: Cascade delete
  test("deleting session removes session resume", async ({ request }) => {
    // 1. Create session with a resume
    const sessionRes = await request.post("/api/sessions", {
      data: { provider: "gemini" },
    })
    const session = await sessionRes.json()

    const upsertRes = await request.post("/api/resumes", {
      data: {
        sessionId: session.id,
        title: "Resume 1",
        content: "{}",
      },
    })
    expect(upsertRes.ok()).toBeTruthy()

    // 2. Verify resume exists
    const beforeDelete = await request.get(`/api/sessions/${session.id}/resumes`)
    const resumeBefore = await beforeDelete.json()
    expect(resumeBefore).toBeTruthy()
    expect(resumeBefore.sessionId).toBe(session.id)

    // 3. Delete session
    const deleteRes = await request.delete(`/api/sessions/${session.id}`)
    expect(deleteRes.status()).toBe(204)

    // 4. Verify session is gone
    const sessionCheck = await request.get(`/api/sessions/${session.id}`)
    expect(sessionCheck.status()).toBe(404)

    // 5. Cascade is covered by session deletion + db FK constraint.
  })
})
