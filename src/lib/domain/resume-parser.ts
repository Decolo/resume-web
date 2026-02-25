/**
 * Pure domain logic for resume parsing and section extraction.
 *
 * All functions operate on strings/objects -- no file I/O.
 */

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

/** Regex patterns mapping raw header text to canonical section names. */
const SECTION_PATTERNS: [RegExp, string][] = [
  [/(?:summary|objective|profile|about)/i, "summary"],
  [/(?:experience|work\s*history|employment)/i, "experience"],
  [/(?:education|academic|qualification)/i, "education"],
  [/(?:skills|technical\s*skills|competencies)/i, "skills"],
  [/(?:projects|portfolio)/i, "projects"],
  [/(?:certifications?|licenses?)/i, "certifications"],
  [/(?:awards?|honors?|achievements?)/i, "awards"],
  [/(?:publications?|papers?)/i, "publications"],
  [/(?:languages?)/i, "languages"],
  [/(?:references?)/i, "references"],
];

/**
 * Extract common resume sections from plain-text content.
 *
 * Returns a record mapping canonical section names (e.g. "experience")
 * to the text found under that heading. Content before the first
 * recognised heading is stored under "header".
 */
export function extractSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split("\n");
  let currentSection = "header";
  let currentContent: string[] = [];

  for (const line of lines) {
    let matched = false;
    for (const [pattern, sectionName] of SECTION_PATTERNS) {
      if (pattern.test(line.trim())) {
        if (currentContent.length > 0) {
          sections[currentSection] = currentContent.join("\n").trim();
        }
        currentSection = sectionName;
        currentContent = [];
        matched = true;
        break;
      }
    }

    if (!matched) {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

// ---------------------------------------------------------------------------
// JSON Resume -> readable text
// ---------------------------------------------------------------------------

export interface JsonResumeBasics {
  name?: string;
  label?: string;
  email?: string;
  phone?: string;
  summary?: string;
  location?: { city?: string; region?: string };
}

export interface JsonResumeWork {
  position?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
}

export interface JsonResumeEducation {
  studyType?: string;
  area?: string;
  institution?: string;
  startDate?: string;
  endDate?: string;
}

export interface JsonResumeSkill {
  name?: string;
  keywords?: string[];
}

export interface JsonResume {
  basics?: JsonResumeBasics;
  work?: JsonResumeWork[];
  education?: JsonResumeEducation[];
  skills?: JsonResumeSkill[];
  [key: string]: unknown;
}

export interface JsonResumeTextResult {
  text: string;
  metadata: { format: string; sections: string[] };
}

/**
 * Convert a JSON Resume object into human-readable text.
 *
 * Returns `{ text, metadata }` where metadata contains
 * `{ format: "json_resume", sections: [...] }`.
 */
export function jsonResumeToText(data: JsonResume): JsonResumeTextResult {
  const parts: string[] = [];

  if (data.basics) {
    const b = data.basics;
    parts.push(`# ${b.name ?? "Unknown"}`);
    parts.push(b.label ?? "");
    parts.push(`Email: ${b.email ?? ""}`);
    parts.push(`Phone: ${b.phone ?? ""}`);
    if (b.location) {
      parts.push(`Location: ${b.location.city ?? ""}, ${b.location.region ?? ""}`);
    }
    parts.push(`\n${b.summary ?? ""}`);
  }

  if (data.work) {
    parts.push("\n## Work Experience");
    for (const job of data.work) {
      parts.push(`\n### ${job.position ?? ""} at ${job.company ?? ""}`);
      parts.push(`${job.startDate ?? ""} - ${job.endDate ?? "Present"}`);
      parts.push(job.summary ?? "");
      for (const highlight of job.highlights ?? []) {
        parts.push(`- ${highlight}`);
      }
    }
  }

  if (data.education) {
    parts.push("\n## Education");
    for (const edu of data.education) {
      parts.push(`\n### ${edu.studyType ?? ""} in ${edu.area ?? ""}`);
      parts.push(edu.institution ?? "");
      parts.push(`${edu.startDate ?? ""} - ${edu.endDate ?? ""}`);
    }
  }

  if (data.skills) {
    parts.push("\n## Skills");
    for (const skill of data.skills) {
      const keywords = (skill.keywords ?? []).join(", ");
      parts.push(`- ${skill.name ?? ""}: ${keywords}`);
    }
  }

  const metadata = { format: "json_resume", sections: Object.keys(data) };
  return { text: parts.join("\n"), metadata };
}
