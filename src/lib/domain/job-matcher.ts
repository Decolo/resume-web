/**
 * Pure domain logic for job description matching against resumes.
 *
 * All functions operate on content strings -- no file I/O.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "have", "been", "will",
  "with", "this", "that", "from", "they", "were", "which", "their",
  "about", "would", "there", "what", "also", "into", "more", "other",
  "than", "then", "them", "these", "some", "such", "only", "over",
  "very", "just", "being", "through", "during", "before", "after",
  "above", "below", "between", "under", "again", "further", "once",
  "here", "when", "where", "both", "each", "most", "same", "should",
  "could", "does", "doing", "while", "must", "work", "working",
  "looking", "seeking", "ability", "able", "including", "using",
  "strong", "excellent", "good", "great", "well", "team", "role",
  "position", "company", "join", "ideal", "candidate", "required",
  "preferred", "minimum", "years", "year", "experience",
]);

export interface Suggestion {
  section: string;
  action: string;
  detail: string;
}

export interface JobMatchResult {
  matchScore: number;
  matchedKeywords: Set<string>;
  missingKeywords: Set<string>;
  extraKeywords: Set<string>;
  requirements: Record<string, string[]>;
  suggestions: Suggestion[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare resume content against a job description.
 *
 * Returns a JobMatchResult with keyword overlap, gaps, and
 * actionable suggestions.
 */
export function matchJob(resumeContent: string, jobDescription: string): JobMatchResult {
  const resumeKw = extractKeywords(resumeContent);
  const jdKw = extractKeywords(jobDescription);
  const requirements = extractRequirements(jobDescription);

  const matched = new Set(Array.from(resumeKw).filter((w) => jdKw.has(w)));
  const missing = new Set(Array.from(jdKw).filter((w) => !resumeKw.has(w)));
  const extra = new Set(Array.from(resumeKw).filter((w) => !jdKw.has(w)));

  const score = calculateMatchScore(resumeKw, jdKw, requirements, resumeContent);
  const suggestions = generateSuggestions(missing, requirements, resumeContent);

  return {
    matchScore: score,
    matchedKeywords: matched,
    missingKeywords: missing,
    extraKeywords: extra,
    requirements,
    suggestions,
  };
}

/** Extract meaningful keywords from text, filtering stop words. */
export function extractKeywords(text: string): Set<string> {
  const words = new Set((text.toLowerCase().match(/\b[a-z][a-z+#.]{2,}\b/g) ?? []));
  const multiWordPattern =
    /\b(?:machine learning|deep learning|data science|project management|full stack|front end|back end|cloud computing|continuous integration|continuous delivery|natural language processing|computer vision)\b/g;
  const multiWord = (text.toLowerCase().match(multiWordPattern) ?? []).map((m) => m.toLowerCase());
  for (const mw of multiWord) {
    words.add(mw);
  }
  return new Set(Array.from(words).filter((w) => !STOP_WORDS.has(w)));
}

/** Extract structured requirements from a job description string. */
export function extractRequirements(jd: string): Record<string, string[]> {
  const reqs: Record<string, string[]> = {
    required_skills: [],
    preferred_skills: [],
    qualifications: [],
  };
  const lower = jd.toLowerCase();

  const reqSection = lower.match(
    /(?:required|must have|requirements?|qualifications?)[:\s]*\n((?:[-\u2022*]\s*.+\n?)+)/
  );
  if (reqSection) {
    const items = reqSection[1].match(/[-\u2022*]\s*(.+)/g) ?? [];
    reqs.required_skills = items.map((i) => i.replace(/^[-\u2022*]\s*/, "").trim());
  }

  const prefSection = lower.match(
    /(?:preferred|nice to have|bonus|desired)[:\s]*\n((?:[-\u2022*]\s*.+\n?)+)/
  );
  if (prefSection) {
    const items = prefSection[1].match(/[-\u2022*]\s*(.+)/g) ?? [];
    reqs.preferred_skills = items.map((i) => i.replace(/^[-\u2022*]\s*/, "").trim());
  }

  const eduMatch = lower.match(
    /(?:bachelor|master|phd|degree|b\.?s\.?|m\.?s\.?|mba)[^.]*/
  );
  if (eduMatch) {
    reqs.qualifications.push(eduMatch[0].trim());
  }

  const expMatch = lower.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/);
  if (expMatch) {
    reqs.qualifications.push(`${expMatch[1]}+ years experience`);
  }

  return reqs;
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

/** Render a JobMatchResult as a human-readable report. */
export function formatMatchReport(result: JobMatchResult): string {
  const grade = scoreToGrade(result.matchScore);
  const lines = [`## Job Match Score: ${result.matchScore}/100 ${grade}`, ""];

  if (result.matchedKeywords.size > 0) {
    const top = Array.from(result.matchedKeywords).sort().slice(0, 20);
    lines.push(`### Matching Keywords (${result.matchedKeywords.size})`);
    lines.push(top.join(", "));
    lines.push("");
  }

  if (result.missingKeywords.size > 0) {
    const top = Array.from(result.missingKeywords).sort().slice(0, 20);
    lines.push(`### Missing Keywords (${result.missingKeywords.size})`);
    lines.push(top.join(", "));
    lines.push("");
  }

  if (Object.values(result.requirements).some((v) => v.length > 0)) {
    lines.push("### Requirements Analysis");
    for (const [category, items] of Object.entries(result.requirements)) {
      if (items.length > 0) {
        const label = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        lines.push(`\n${label}:`);
        for (const item of items) {
          lines.push(`- ${item}`);
        }
      }
    }
    lines.push("");
  }

  if (result.suggestions.length > 0) {
    lines.push("### Suggestions");
    result.suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. [${s.section}] ${s.detail}`);
    });
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function calculateMatchScore(
  resumeKw: Set<string>,
  jdKw: Set<string>,
  requirements: Record<string, string[]>,
  resumeContent: string,
): number {
  if (jdKw.size === 0) return 50;

  const overlap = Array.from(resumeKw).filter((w) => jdKw.has(w)).length / Math.max(jdKw.size, 1);
  const kwScore = Math.min(overlap * 100, 100);

  let reqScore = 100;
  const lower = resumeContent.toLowerCase();

  const required = requirements.required_skills ?? [];
  if (required.length > 0) {
    const matchedReqs = required.filter((r) =>
      r.split(/\s+/).some((w) => w.length > 3 && lower.includes(w))
    ).length;
    reqScore = (matchedReqs / required.length) * 100;
  }

  return Math.min(Math.round(kwScore * 0.6 + reqScore * 0.4), 100);
}

function generateSuggestions(
  missing: Set<string>,
  requirements: Record<string, string[]>,
  resumeContent: string,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const lower = resumeContent.toLowerCase();

  const techMissing = Array.from(missing)
    .filter((kw) => /[.+#]/.test(kw) || kw.length <= 10)
    .sort()
    .slice(0, 10);
  if (techMissing.length > 0) {
    suggestions.push({
      section: "skills",
      action: "add",
      detail: `Add missing technical keywords: ${techMissing.join(", ")}`,
    });
  }

  for (const req of requirements.required_skills ?? []) {
    const reqWords = req.split(/\s+/).filter((w) => w.length > 3);
    if (!reqWords.some((w) => lower.includes(w))) {
      suggestions.push({
        section: "experience",
        action: "add",
        detail: `Address required skill: ${req}`,
      });
    }
  }

  for (const qual of requirements.qualifications ?? []) {
    if (!lower.includes(qual)) {
      suggestions.push({
        section: "education",
        action: "verify",
        detail: `Ensure qualification is visible: ${qual}`,
      });
    }
  }

  return suggestions.slice(0, 15);
}

function scoreToGrade(score: number): string {
  if (score >= 85) return "Strong Match";
  if (score >= 70) return "Good Match";
  if (score >= 50) return "Partial Match";
  return "Weak Match";
}
