import { describe, it, expect } from "vitest"
import { diffObjects } from "./diff"

describe("diffObjects", () => {
  it("detects a changed field", () => {
    expect(diffObjects({ name: "John" }, { name: "John Smith" })).toEqual([
      { path: "name", old: "John", new: "John Smith", type: "changed" },
    ])
  })

  it("detects an added field", () => {
    expect(diffObjects({}, { name: "John" })).toEqual([
      { path: "name", old: undefined, new: "John", type: "added" },
    ])
  })

  it("detects a removed field", () => {
    expect(diffObjects({ name: "John" }, {})).toEqual([
      { path: "name", old: "John", new: undefined, type: "removed" },
    ])
  })

  it("recurses into nested objects with dot-notation paths", () => {
    expect(
      diffObjects(
        { basics: { name: "John" } },
        { basics: { name: "John Smith" } },
      )
    ).toEqual([
      { path: "basics.name", old: "John", new: "John Smith", type: "changed" },
    ])
  })

  it("treats arrays as leaf nodes, not recursing into them", () => {
    const old = { skills: ["js", "ts"] }
    const next = { skills: ["js", "ts", "react"] }
    expect(diffObjects(old, next)).toEqual([
      { path: "skills", old: ["js", "ts"], new: ["js", "ts", "react"], type: "changed" },
    ])
  })
})
