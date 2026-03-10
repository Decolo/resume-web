import { NextRequest, NextResponse } from "next/server"

export const config = {
  matcher: "/api/:path*",
}

export function middleware(req: NextRequest) {
  const requestId =
    req.headers.get("x-request-id") ?? crypto.randomUUID()

  const { method, nextUrl } = req
  const path = nextUrl.pathname

  console.log(
    JSON.stringify({
      level: "info",
      msg: "request",
      ts: new Date().toISOString(),
      method,
      path,
      requestId,
    }),
  )

  const reqHeaders = new Headers(req.headers)
  reqHeaders.set("x-request-id", requestId)

  return NextResponse.next({
    request: { headers: reqHeaders },
    headers: { "x-request-id": requestId },
  })
}
