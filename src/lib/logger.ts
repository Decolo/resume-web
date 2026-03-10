type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined
  if (env && env in LEVEL_ORDER) return env
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    }
  }
  return { message: String(err) }
}

function emit(
  level: LogLevel,
  msg: string,
  ctx: Record<string, unknown>,
  extra?: Record<string, unknown>,
) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinLevel()]) return

  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...ctx,
    ...extra,
  }

  const line = JSON.stringify(entry)

  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export function getRequestId(headers: Headers): string {
  return headers.get("x-request-id") ?? crypto.randomUUID()
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, err?: unknown, data?: Record<string, unknown>): void
  time<T>(label: string, fn: () => Promise<T>): Promise<T>
}

export function createLogger(ctx: {
  route: string
  requestId?: string
}): Logger {
  const base: Record<string, unknown> = {
    route: ctx.route,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
  }

  return {
    debug(msg, data) {
      emit("debug", msg, base, data)
    },
    info(msg, data) {
      emit("info", msg, base, data)
    },
    warn(msg, data) {
      emit("warn", msg, base, data)
    },
    error(msg, err, data) {
      emit("error", msg, base, {
        ...data,
        ...(err ? { error: serializeError(err) } : {}),
      })
    },
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now()
      try {
        const result = await fn()
        emit("info", `${label} completed`, base, {
          durationMs: Date.now() - start,
        })
        return result
      } catch (err) {
        emit("error", `${label} failed`, base, {
          durationMs: Date.now() - start,
          error: serializeError(err),
        })
        throw err
      }
    },
  }
}
