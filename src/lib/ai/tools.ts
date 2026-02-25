/**
 * AI SDK tool definitions for the resume agent.
 *
 * Each tool wraps a pure domain function so the LLM can invoke it via
 * Vercel AI SDK function calling. Parameter validation uses Zod.
 */

import { tool } from "ai";
import { z } from "zod";
import { JSONPath } from "jsonpath-plus";

import { scoreAts, formatAtsReport } from "@/lib/domain/ats-scorer";
import { matchJob, formatMatchReport } from "@/lib/domain/job-matcher";
import {
  validateResume as domainValidate,
  formatValidationReport,
} from "@/lib/domain/resume-validator";

// ---------------------------------------------------------------------------
// updateSection
// ---------------------------------------------------------------------------

/**
 * Build the updateSection tool.
 *
 * Because this tool mutates the resume object held in the caller's closure,
 * we accept a getter/setter pair rather than importing global state.
 */
export function makeUpdateSectionTool(
  getResume: () => Record<string, unknown>,
  setResume: (next: Record<string, unknown>) => void,
) {
  return tool({
    description:
      "Update a section of the resume by path. " +
      "Use simple dot notation (e.g. 'basics.name', 'work[0].highlights'). " +
      "Supports nested objects and arrays. The value can be a string, array, or object.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Path expression pointing to the field to update (e.g. 'basics.name' or 'work[0].company')"),
      value: z
        .unknown()
        .describe("New value to set at the given path"),
    }),
    execute: async ({ path, value }) => {
      const resume = structuredClone(getResume());

      // Verify the path is reachable (parent must exist)
      const existing = JSONPath({ path, json: resume });
      if (existing.length === 0) {
        // Try to set it anyway -- JSONPath doesn't natively "set",
        // so we do a manual walk for simple dot/bracket paths.
        const set = setByPath(resume, path, value);
        if (!set) {
          return { success: false, error: `Path not found: ${path}` };
        }
      } else {
        setByPath(resume, path, value);
      }

      setResume(resume);
      return { success: true, path, updatedValue: value };
    },
  });
}

// ---------------------------------------------------------------------------
// scoreATS
// ---------------------------------------------------------------------------

export const scoreATSTool = tool({
  description:
    "Score the resume content for ATS (Applicant Tracking System) compatibility. " +
    "Returns a 0-100 score with per-category breakdown and suggestions.",
  inputSchema: z.object({
    content: z.string().describe("The full resume text to score"),
    jobDescription: z
      .string()
      .optional()
      .describe("Optional job description for keyword matching"),
  }),
  execute: async ({ content, jobDescription }) => {
    const result = scoreAts(content, jobDescription ?? "");
    const report = formatAtsReport(result);
    return {
      overallScore: result.overallScore,
      formatting: result.formatting.score,
      completeness: result.completeness.score,
      keywords: result.keywords.score,
      structure: result.structure.score,
      suggestions: result.suggestions,
      report,
    };
  },
});

// ---------------------------------------------------------------------------
// matchJob
// ---------------------------------------------------------------------------

export const matchJobTool = tool({
  description:
    "Match the resume against a job description. " +
    "Returns a match score, matched/missing keywords, and suggestions.",
  inputSchema: z.object({
    resumeContent: z.string().describe("The full resume text"),
    jobDescription: z.string().describe("The job description to match against"),
  }),
  execute: async ({ resumeContent, jobDescription }) => {
    const result = matchJob(resumeContent, jobDescription);
    const report = formatMatchReport(result);
    return {
      matchScore: result.matchScore,
      matchedKeywords: [...result.matchedKeywords],
      missingKeywords: [...result.missingKeywords],
      suggestions: result.suggestions,
      report,
    };
  },
});

// ---------------------------------------------------------------------------
// validateResume
// ---------------------------------------------------------------------------

export const validateResumeTool = tool({
  description:
    "Validate resume content for completeness, formatting, and encoding issues. " +
    "Returns errors and warnings.",
  inputSchema: z.object({
    content: z.string().describe("The resume content to validate"),
    fileFormat: z
      .enum([".md", ".txt", ".html", ".json"])
      .optional()
      .describe("File format hint (default: .md)"),
  }),
  execute: async ({ content, fileFormat }) => {
    const result = domainValidate(content, fileFormat ?? ".md");
    const report = formatValidationReport("resume", result);
    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      report,
    };
  },
});

// ---------------------------------------------------------------------------
// Convenience: all static tools as a record
// ---------------------------------------------------------------------------

export const resumeTools = {
  scoreATS: scoreATSTool,
  matchJob: matchJobTool,
  validateResume: validateResumeTool,
};

// ---------------------------------------------------------------------------
// Internal helper: set a value by JSONPath-like expression
// ---------------------------------------------------------------------------

/**
 * Walk a simple JSONPath ($.a.b[0].c) and set the leaf value.
 * Returns true if the path was successfully set.
 */
function setByPath(
  obj: Record<string, unknown>,
  jsonPath: string,
  value: unknown,
): boolean {
  // Strip leading "$." and split on "." or "[n]"
  const normalized = jsonPath.replace(/^\$\.?/, "");
  const segments = normalized.match(/[^.[\]]+/g);
  if (!segments || segments.length === 0) return false;

  let current: unknown = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const idx = /^\d+$/.test(seg) ? Number(seg) : seg;

    if (current === null || current === undefined) return false;

    if (typeof current === "object") {
      const next = (current as Record<string, unknown>)[idx as string];
      if (next === undefined) {
        // Auto-create intermediate objects/arrays
        const nextSeg = segments[i + 1];
        (current as Record<string, unknown>)[idx as string] = /^\d+$/.test(
          nextSeg,
        )
          ? []
          : {};
      }
      current = (current as Record<string, unknown>)[idx as string];
    } else {
      return false;
    }
  }

  const lastSeg = segments[segments.length - 1];
  const lastIdx = /^\d+$/.test(lastSeg) ? Number(lastSeg) : lastSeg;

  if (current !== null && typeof current === "object") {
    (current as Record<string, unknown>)[lastIdx as string] = value;
    return true;
  }

  return false;
}
