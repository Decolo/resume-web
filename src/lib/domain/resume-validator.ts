/**
 * Pure domain logic for resume content validation.
 *
 * All functions operate on content strings -- no file I/O.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  level: "error" | "warning";
  check: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate resume content for completeness and correctness.
 *
 * `fileFormat` should be the file extension (e.g. ".html", ".json", ".md").
 * Returns a ValidationResult.
 */
export function validateResume(content: string, fileFormat = ".md"): ValidationResult {
  const issues: ValidationIssue[] = [];

  issues.push(...checkContent(content));

  const fmt = fileFormat.toLowerCase();
  if (fmt === ".html") {
    issues.push(...checkHtml(content));
  } else if (fmt === ".json") {
    issues.push(...checkJson(content));
  } else if (fmt === ".md" || fmt === ".txt") {
    issues.push(...checkText(content));
  }

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

/** Render a ValidationResult as a human-readable report. */
export function formatValidationReport(path: string, result: ValidationResult): string {
  const status = result.valid ? "PASS" : "FAIL";
  const lines = [`## Validation: ${status} -- ${path}`, ""];

  if (result.errors.length > 0) {
    lines.push("### Errors");
    for (const e of result.errors) {
      lines.push(`- [${e.check}] ${e.message}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("### Warnings");
    for (const w of result.warnings) {
      lines.push(`- [${w.check}] ${w.message}`);
    }
    lines.push("");
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push("No issues found. Resume looks good!");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Private checks
// ---------------------------------------------------------------------------

function checkContent(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!content.trim()) {
    issues.push({ level: "error", check: "empty", message: "File is empty" });
    return issues;
  }

  const wordCount = content.split(/\s+/).length;
  if (wordCount < 50) {
    issues.push({
      level: "error",
      check: "length",
      message: `Resume is too short (${wordCount} words). Minimum recommended: 150 words.`,
    });
  } else if (wordCount < 150) {
    issues.push({
      level: "warning",
      check: "length",
      message: `Resume is short (${wordCount} words). Recommended: 300-800 words.`,
    });
  } else if (wordCount > 1500) {
    issues.push({
      level: "warning",
      check: "length",
      message: `Resume is long (${wordCount} words). Consider trimming to 1-2 pages.`,
    });
  }

  const placeholders = content.match(
    /\b(?:TODO|FIXME|XXX|PLACEHOLDER|INSERT|YOUR NAME|COMPANY NAME)\b/gi
  );
  if (placeholders) {
    issues.push({
      level: "error",
      check: "placeholders",
      message: `Contains placeholder text: ${Array.from(new Set(placeholders)).join(", ")}`,
    });
  }

  if (content.includes("\ufffd") || content.includes("\u00e2\u20ac") || content.includes("\u00c3")) {
    issues.push({
      level: "error",
      check: "encoding",
      message: "Contains encoding artifacts (mojibake). Re-save with UTF-8 encoding.",
    });
  }

  return issues;
}

function checkHtml(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lower = content.toLowerCase();

  if (!lower.includes("<html")) {
    issues.push({
      level: "error",
      check: "html_structure",
      message: "Missing <html> tag -- not a valid HTML document.",
    });
  }
  if (!lower.includes("<head")) {
    issues.push({ level: "warning", check: "html_head", message: "Missing <head> section." });
  }
  if (!lower.includes("charset")) {
    issues.push({
      level: "warning",
      check: "html_charset",
      message: 'No charset declaration. Add <meta charset="UTF-8">.',
    });
  }
  if (!lower.includes("<style") && !lower.includes("stylesheet")) {
    issues.push({
      level: "warning",
      check: "html_styles",
      message: "No CSS styles found. The resume may look unstyled.",
    });
  }

  return issues;
}

function checkJson(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    issues.push({
      level: "error",
      check: "json_parse",
      message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
    return issues;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    issues.push({
      level: "error",
      check: "json_structure",
      message: "JSON root must be an object, not an array.",
    });
    return issues;
  }

  const obj = data as Record<string, unknown>;
  if (!("basics" in obj)) {
    issues.push({
      level: "warning",
      check: "json_schema",
      message: "Missing 'basics' section (JSON Resume standard).",
    });
  } else {
    const basics = obj.basics as Record<string, unknown> | undefined;
    if (!basics?.name) {
      issues.push({
        level: "warning",
        check: "json_name",
        message: "Missing name in basics section.",
      });
    }
  }

  return issues;
}

function checkText(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const lines = content.trim().split("\n");
  if (lines.length > 0 && !lines[0].trim()) {
    issues.push({
      level: "warning",
      check: "text_start",
      message: "File starts with blank lines.",
    });
  }

  const longLines = lines
    .map((line, i) => ({ line, num: i + 1 }))
    .filter(({ line }) => line.length > 200);
  if (longLines.length > 0) {
    const lineNums = longLines.slice(0, 5).map(({ num }) => String(num));
    issues.push({
      level: "warning",
      check: "text_line_length",
      message: `Lines exceeding 200 chars at line(s): ${lineNums.join(", ")}`,
    });
  }

  return issues;
}
