export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/^\$\.?/, "").split(".")
  let current: unknown = obj
  for (const key of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const clone = structuredClone(obj)
  const parts = path.replace(/^\$\.?/, "").split(".")
  let current: Record<string, unknown> = clone
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
  return clone
}
