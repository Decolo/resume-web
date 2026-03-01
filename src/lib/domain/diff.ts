export interface FieldDiff {
  path: string
  old: unknown
  new: unknown
  type: "added" | "removed" | "changed"
}

export function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix = "",
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key
    const oldVal = oldObj[key]
    const newVal = newObj[key]

    if (!(key in oldObj)) {
      diffs.push({ path, old: undefined, new: newVal, type: "added" })
    } else if (!(key in newObj)) {
      diffs.push({ path, old: oldVal, new: undefined, type: "removed" })
    } else if (
      oldVal !== null && newVal !== null &&
      typeof oldVal === "object" && typeof newVal === "object" &&
      !Array.isArray(oldVal) && !Array.isArray(newVal)
    ) {
      diffs.push(
        ...diffObjects(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          path,
        ),
      )
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ path, old: oldVal, new: newVal, type: "changed" })
    }
  }

  return diffs
}
