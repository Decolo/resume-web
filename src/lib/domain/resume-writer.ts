/**
 * Pure domain logic for resume format conversion.
 *
 * All functions accept and return strings -- no file I/O.
 * The tools layer is responsible for reading/writing files.
 */

// ---------------------------------------------------------------------------
// Markdown -> Plain text
// ---------------------------------------------------------------------------

/** Strip Markdown formatting and return plain text. */
export function markdownToPlainText(content: string): string {
  let text = content;
  text = text.replace(/^#+\s*/gm, "");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");
  text = text.replace(/\[(.+?)\]\(.+?\)/g, "$1");
  text = text.replace(/`(.+?)`/g, "$1");
  return text;
}

// ---------------------------------------------------------------------------
// Markdown -> JSON Resume
// ---------------------------------------------------------------------------

interface JsonResumeOutput {
  basics: {
    name: string;
    label: string;
    email: string;
    phone: string;
    summary: string;
  };
  work: unknown[];
  education: unknown[];
  skills: { name: string; keywords: string[] }[];
}

/** Convert Markdown resume text to a JSON Resume string. */
export function markdownToJsonResume(content: string): string {
  const resume: JsonResumeOutput = {
    basics: { name: "", label: "", email: "", phone: "", summary: "" },
    work: [],
    education: [],
    skills: [],
  };

  const lines = content.split("\n");
  let currentSection: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!resume.basics.name && line && line.startsWith("#")) {
      resume.basics.name = line.replace(/^#+\s*/, "");
      continue;
    }

    if (/^##?\s*(summary|objective|profile|about)/i.test(line)) {
      currentSection = "summary";
    } else if (/^##?\s*(experience|work|employment)/i.test(line)) {
      currentSection = "work";
    } else if (/^##?\s*(education|academic)/i.test(line)) {
      currentSection = "education";
    } else if (/^##?\s*(skills|technical)/i.test(line)) {
      currentSection = "skills";
    } else if (currentSection === "summary" && line) {
      resume.basics.summary += line + " ";
    } else if (currentSection === "skills" && line.startsWith("-")) {
      const skillText = line.replace(/^-\s*/, "");
      if (skillText.includes(":")) {
        const [name, rest] = skillText.split(":", 2);
        resume.skills.push({
          name: name.trim(),
          keywords: rest.split(",").map((k) => k.trim()),
        });
      } else {
        resume.skills.push({ name: skillText, keywords: [] });
      }
    }

    const emailMatch = line.match(/[\w.\-]+@[\w.\-]+\.\w+/);
    if (emailMatch && !resume.basics.email) {
      resume.basics.email = emailMatch[0];
    }

    const phoneMatch = line.match(/[+]?[\d\-() ]{10,}/);
    if (phoneMatch && !resume.basics.phone) {
      resume.basics.phone = phoneMatch[0].trim();
    }
  }

  resume.basics.summary = resume.basics.summary.trim();
  return JSON.stringify(resume, null, 2);
}

// ---------------------------------------------------------------------------
// Markdown -> HTML
// ---------------------------------------------------------------------------

/** Minimal fallback CSS when no template is provided. */
const FALLBACK_CSS = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .resume-container { max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { font-size: 2em; margin-bottom: 0.2em; }
        h2 { font-size: 1.2em; margin-top: 1.5em; border-bottom: 1px solid #ccc; }
        p { margin-bottom: 0.8em; }
        ul { margin-left: 1.5em; }
        li { margin-bottom: 0.3em; }
        a { color: #0066cc; }
`;

/**
 * Convert Markdown resume to a standalone HTML document.
 *
 * `css` is injected into a `<style>` tag. Falls back to
 * `FALLBACK_CSS` when `css` is not provided.
 */
export function markdownToHtml(content: string, css?: string): string {
  const htmlBody = basicMdToHtml(content);
  const styles = css ?? FALLBACK_CSS;

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="en">\n' +
    "<head>\n" +
    '    <meta charset="UTF-8">\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    "    <title>Resume</title>\n" +
    "    <style>\n" +
    `${styles}\n` +
    "    </style>\n" +
    "</head>\n" +
    "<body>\n" +
    '    <div class="resume-container">\n' +
    `${htmlBody}\n` +
    "    </div>\n" +
    "</body>\n" +
    "</html>"
  );
}

/** Minimal Markdown -> HTML conversion. */
function basicMdToHtml(content: string): string {
  let html = content;
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n)+/g, "<ul>$&</ul>");
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  return html;
}
