/**
 * Pure domain logic for ATS (Applicant Tracking System) resume scoring.
 *
 * All functions operate on content strings -- no file I/O.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ATS_KEYWORDS: Record<string, string[]> = {
  action_verbs: [
    "achieved", "administered", "analyzed", "built", "collaborated",
    "created", "delivered", "designed", "developed", "directed",
    "established", "executed", "generated", "implemented", "improved",
    "increased", "launched", "led", "managed", "optimized",
    "organized", "produced", "reduced", "resolved", "streamlined",
  ],
  sections: [
    "experience", "education", "skills", "summary", "objective",
    "projects", "certifications", "awards", "achievements",
    "work history", "employment", "qualifications",
  ],
  contact: ["email", "phone", "linkedin", "github", "portfolio"],
};

export const SCORING_WEIGHTS: Record<string, number> = {
  formatting: 0.20,
  completeness: 0.25,
  keywords: 0.30,
  structure: 0.25,
};

export interface CategoryScore {
  score: number;
  issues: string[];
}

export interface ATSScoreResult {
  overallScore: number;
  formatting: CategoryScore;
  completeness: CategoryScore;
  keywords: CategoryScore;
  structure: CategoryScore;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score resume content for ATS compatibility.
 *
 * Returns an ATSScoreResult with per-category breakdowns.
 * Optionally accepts `jobDescription` for keyword matching.
 */
export function scoreAts(content: string, jobDescription = ""): ATSScoreResult {
  const fmt = checkFormatting(content);
  const comp = checkCompleteness(content);
  const kw = checkKeywords(content, jobDescription);
  const struct = checkStructure(content);

  const overall = Math.round(
    fmt.score * SCORING_WEIGHTS.formatting +
    comp.score * SCORING_WEIGHTS.completeness +
    kw.score * SCORING_WEIGHTS.keywords +
    struct.score * SCORING_WEIGHTS.structure
  );

  const suggestions = [
    ...fmt.issues,
    ...comp.issues,
    ...kw.issues,
    ...struct.issues,
  ];

  return {
    overallScore: overall,
    formatting: fmt,
    completeness: comp,
    keywords: kw,
    structure: struct,
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// Formatting report (pure string output)
// ---------------------------------------------------------------------------

/** Render an ATSScoreResult as a human-readable report. */
export function formatAtsReport(result: ATSScoreResult): string {
  const grade = scoreToGrade(result.overallScore);
  const bar = scoreBar(result.overallScore);

  const lines = [
    `## ATS Score: ${result.overallScore}/100 ${grade}`,
    bar,
    "",
    "| Category     | Score | Weight |",
    "|-------------|-------|--------|",
    `| Formatting   | ${String(result.formatting.score).padStart(3)} | ${fmtPct(SCORING_WEIGHTS.formatting)} |`,
    `| Completeness | ${String(result.completeness.score).padStart(3)} | ${fmtPct(SCORING_WEIGHTS.completeness)} |`,
    `| Keywords     | ${String(result.keywords.score).padStart(3)} | ${fmtPct(SCORING_WEIGHTS.keywords)} |`,
    `| Structure    | ${String(result.structure.score).padStart(3)} | ${fmtPct(SCORING_WEIGHTS.structure)} |`,
  ];

  if (result.suggestions.length > 0) {
    lines.push("");
    lines.push("### Suggestions");
    result.suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. ${s}`);
    });
  }

  return lines.join("\n");
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`.padEnd(4);
}

// ---------------------------------------------------------------------------
// Private scoring helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "have", "been", "will",
  "with", "this", "that", "from", "they", "were", "which", "their",
  "about", "would", "there", "what", "also", "into", "more", "other",
]);

function checkFormatting(content: string): CategoryScore {
  let score = 100;
  const issues: string[] = [];

  if (/\|.*\|.*\|/.test(content)) {
    score -= 15;
    issues.push("Contains tables -- many ATS systems can't parse table layouts");
  }

  const fancyChars = content.match(/[•●◆★☆►▸▹→←↑↓✓✗✔✘❌✅]/g);
  if (fancyChars) {
    score -= 10;
    const unique = Array.from(new Set(fancyChars)).slice(0, 5).join(", ");
    issues.push(
      `Contains special characters (${unique}) -- use standard bullets (- or *)`
    );
  }

  const longLines = content.split("\n").filter((l) => l.length > 120);
  if (longLines.length > 5) {
    score -= 10;
    issues.push(
      `${longLines.length} lines exceed 120 characters -- consider shorter lines for readability`
    );
  }

  if (/!\[.*?\]\(.*?\)/.test(content)) {
    score -= 15;
    issues.push("Contains embedded images -- ATS cannot read images");
  }

  if (/\n{4,}/.test(content)) {
    score -= 5;
    issues.push("Excessive blank lines -- tighten spacing for cleaner formatting");
  }

  return { score: Math.max(0, score), issues };
}

function checkCompleteness(content: string): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const lower = content.toLowerCase();

  const hasEmail = /[\w.\-+]+@[\w.\-]+\.\w+/.test(content);
  const hasPhone = /[+]?[\d\-() ]{10,}/.test(content);
  const hasLinkedin = lower.includes("linkedin");

  if (!hasEmail) {
    score -= 15;
    issues.push("Missing email address -- essential for recruiter contact");
  }
  if (!hasPhone) {
    score -= 10;
    issues.push("Missing phone number -- most recruiters expect a phone number");
  }
  if (!hasLinkedin) {
    score -= 5;
    issues.push("No LinkedIn URL -- consider adding your LinkedIn profile");
  }

  const requiredSections: Record<string, string[]> = {
    experience: ["experience", "work history", "employment", "professional experience"],
    education: ["education", "academic"],
    skills: ["skills", "technical skills", "core competencies"],
  };
  const optionalSections: Record<string, string[]> = {
    summary: ["summary", "objective", "profile", "about me"],
    projects: ["projects", "portfolio"],
  };

  for (const [sectionName, keywords] of Object.entries(requiredSections)) {
    if (!keywords.some((kw) => lower.includes(kw))) {
      score -= 15;
      issues.push(`Missing '${sectionName}' section -- this is expected by most ATS systems`);
    }
  }

  for (const [sectionName, keywords] of Object.entries(optionalSections)) {
    if (!keywords.some((kw) => lower.includes(kw))) {
      score -= 5;
      issues.push(`No '${sectionName}' section -- recommended for a complete resume`);
    }
  }

  const datePatterns = lower.match(
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]+\d{4}|\d{4}\s*[-–—]\s*(?:\d{4}|present|current)/g
  );
  if (!datePatterns) {
    score -= 10;
    issues.push("No dates found -- include employment dates (e.g., 'Jan 2020 - Present')");
  }

  return { score: Math.max(0, score), issues };
}

function checkKeywords(content: string, jobDescription = ""): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const lower = content.toLowerCase();
  const words = lower.match(/\b[a-z]+\b/g) ?? [];

  const foundVerbs = ATS_KEYWORDS.action_verbs.filter((v) => lower.includes(v));
  const verbRatio = foundVerbs.length / Math.max(ATS_KEYWORDS.action_verbs.length, 1);
  if (verbRatio < 0.2) {
    score -= 20;
    issues.push("Few action verbs found -- use strong verbs like: Led, Developed, Implemented, Achieved");
  } else if (verbRatio < 0.4) {
    score -= 10;
    issues.push("Could use more action verbs -- try: Optimized, Streamlined, Delivered, Launched");
  }

  const numbers = content.match(
    /\d+[%$kKmMbB]|\$[\d,]+|\d+\+?\s*(?:years?|months?|clients?|users?|projects?)/g
  );
  if (!numbers) {
    score -= 20;
    issues.push("No quantifiable achievements -- add metrics (e.g., 'Increased revenue by 25%')");
  } else if (numbers.length < 3) {
    score -= 10;
    issues.push(`Only ${numbers.length} metric(s) found -- aim for at least 3-5 quantified achievements`);
  }

  if (jobDescription.trim()) {
    const jdLower = jobDescription.toLowerCase();
    const jdWords = new Set((jdLower.match(/\b[a-z]{3,}\b/g) ?? []));
    const jdKeywords = new Set(Array.from(jdWords).filter((w) => !STOP_WORDS.has(w)));
    const resumeWords = new Set(words);

    const matched = new Set(Array.from(jdKeywords).filter((w) => resumeWords.has(w)));
    const missing = Array.from(jdKeywords).filter((w) => !resumeWords.has(w));

    const matchRate = matched.size / Math.max(jdKeywords.size, 1);
    if (matchRate < 0.3) {
      score -= 25;
      const topMissing = missing.sort().slice(0, 10);
      issues.push(`Low job keyword match (${Math.round(matchRate * 100)}%) -- consider adding: ${topMissing.join(", ")}`);
    } else if (matchRate < 0.5) {
      score -= 15;
      const topMissing = missing.sort().slice(0, 7);
      issues.push(`Moderate job keyword match (${Math.round(matchRate * 100)}%) -- missing: ${topMissing.join(", ")}`);
    }
  }

  return { score: Math.max(0, score), issues };
}

function checkStructure(content: string): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const lines = content.split("\n");

  const headers = lines.filter(
    (l) => /^#{1,3}\s+\S/.test(l) || (l === l.toUpperCase() && l.trim().length > 3)
  );
  if (headers.length < 3) {
    score -= 15;
    issues.push("Few section headers found -- use clear headers (## Experience, ## Education, etc.)");
  }

  const bulletStyles = new Set<string>();
  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith("- ")) bulletStyles.add("-");
    else if (s.startsWith("* ")) bulletStyles.add("*");
    else if (/^\d+\.\s/.test(s)) bulletStyles.add("numbered");
    else if (s.startsWith("\u2022 ")) bulletStyles.add("\u2022");
  }
  if (bulletStyles.size > 1) {
    score -= 10;
    issues.push(`Inconsistent bullet styles (${Array.from(bulletStyles).join(", ")}) -- pick one style throughout`);
  }

  const wordCount = content.split(/\s+/).length;
  if (wordCount < 150) {
    score -= 15;
    issues.push(`Resume is very short (${wordCount} words) -- most resumes should be 300-800 words`);
  } else if (wordCount > 1200) {
    score -= 10;
    issues.push(`Resume is long (${wordCount} words) -- consider trimming to 1-2 pages (300-800 words)`);
  }

  const dateFormats = new Set<string>();
  if (/\b\d{1,2}\/\d{4}\b/.test(content)) dateFormats.add("MM/YYYY");
  if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}\b/.test(content)) dateFormats.add("Month YYYY");
  if (/\b\d{4}-\d{2}\b/.test(content)) dateFormats.add("YYYY-MM");
  if (dateFormats.size > 1) {
    score -= 5;
    issues.push(`Mixed date formats (${Array.from(dateFormats).join(", ")}) -- use one consistent format`);
  }

  return { score: Math.max(0, score), issues };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreToGrade(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs Work";
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return `[${"=".repeat(filled)}${" ".repeat(width - filled)}]`;
}