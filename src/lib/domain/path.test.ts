import { describe, it, expect } from "vitest"
import { getByPath, setByPath } from "./path"

describe("getByPath", () => {
  it("reads a top-level field", () => {
    expect(getByPath({ name: "John" }, "name")).toBe("John")
  })

  it("reads a nested field", () => {
    expect(getByPath({ basics: { name: "John" } }, "basics.name")).toBe("John")
  })

  it("handles $ prefix", () => {
    expect(getByPath({ basics: { name: "John" } }, "$.basics.name")).toBe("John")
  })

  it("returns undefined for a missing path", () => {
    expect(getByPath({}, "basics.name")).toBeUndefined()
  })
})

describe("setByPath", () => {
  it("sets a top-level field", () => {
    expect(setByPath({}, "name", "John")).toEqual({ name: "John" })
  })

  it("sets a nested field", () => {
    expect(setByPath({}, "basics.name", "John")).toEqual({ basics: { name: "John" } })
  })

  it("does not mutate the original object", () => {
    const original = { basics: { name: "John" } }
    setByPath(original, "basics.name", "Jane")
    expect(original.basics.name).toBe("John")
  })
})
