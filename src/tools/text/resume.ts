/** Tool 22: Resume Builder. Three templates, flexible sections, PDF export. */
import { esc, htmlDocument, type PaperSize } from "./doc-utils";
import { editorTool } from "./editor-tool";

export const resume = editorTool({
  id: 22,
  slug: "resume-builder",
  name: "Resume Builder",
  verb: "Build Resume",
  description: "A clean resume in three templates with live preview. Add, reorder and remove sections, then save as PDF. Data stays on this device.",
  seoTitle: "Resume Builder: free, private, three templates, save as PDF",
  seoDescription:
    "Build a resume in your browser with three clean templates and a live preview. Add and reorder sections, then save as PDF. No account, no upload: your data stays on your device.",
  howTo: [
    "Fill in your details. Add sections like Experience, Education and Skills, and reorder them with the arrows.",
    "Pick a template and paper size. The preview updates as you type.",
    "Press Save as PDF and choose Save as PDF in the print dialog.",
  ],
  faqs: [
    { q: "Is my resume saved online?", a: "No. It is saved only in this browser's local storage so you can come back to it. Use Clear data to remove it." },
    { q: "Are the templates readable by applicant tracking systems?", a: "Yes. All three are single text layers with real headings and no images of text, which keeps them readable by ATS software." },
    { q: "A4 or Letter?", a: "Use A4 for most international applications and Letter (short bond) when the employer asks for it. Both are in the settings." },
  ],
  icon: "resume",
});

export type ResumeTemplate = "classic" | "modern" | "compact";
export type SectionKind = "entries" | "list" | "text";

export interface ResumeEntry {
  id: string;
  title: string;
  subtitle: string;
  period: string;
  /** One bullet per line. */
  details: string;
}

export interface ResumeSection {
  id: string;
  kind: SectionKind;
  title: string;
  entries: ResumeEntry[];
  /** For "list" (comma or line separated) and "text" sections. */
  content: string;
}

export interface ResumeData {
  template: ResumeTemplate;
  paper: PaperSize;
  /** Accent colour used by the templates. */
  accent: string;
  basics: { name: string; headline: string; email: string; phone: string; location: string; links: string; summary: string };
  sections: ResumeSection[];
}

let counter = 0;
export const resumeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

export function newEntry(): ResumeEntry {
  return { id: resumeId("entry"), title: "", subtitle: "", period: "", details: "" };
}

/** Section presets offered by "Add section". */
export const SECTION_PRESETS: { title: string; kind: SectionKind }[] = [
  { title: "Experience", kind: "entries" },
  { title: "Education", kind: "entries" },
  { title: "Skills", kind: "list" },
  { title: "Projects", kind: "entries" },
  { title: "Certifications", kind: "list" },
  { title: "Languages", kind: "list" },
  { title: "Volunteer work", kind: "entries" },
  { title: "Custom section", kind: "text" },
];

export function newSection(title: string, kind: SectionKind): ResumeSection {
  return { id: resumeId("section"), kind, title, entries: kind === "entries" ? [newEntry()] : [], content: "" };
}

export function newResume(): ResumeData {
  return {
    template: "classic",
    paper: "a4",
    accent: "#2f5d1e",
    basics: { name: "", headline: "", email: "", phone: "", location: "", links: "", summary: "" },
    sections: [newSection("Experience", "entries"), newSection("Education", "entries"), newSection("Skills", "list")],
  };
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
const listItems = (text: string) =>
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
const safeColor = (value: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value : "#2f5d1e");

function sectionHtml(section: ResumeSection, template: ResumeTemplate): string {
  let inner = "";
  if (section.kind === "entries") {
    inner = section.entries
      .filter((entry) => entry.title || entry.subtitle || entry.details)
      .map((entry) => {
        const bullets = lines(entry.details);
        return `<div class="entry">
          <div class="entry-head">
            <div><strong>${esc(entry.title)}</strong>${entry.subtitle ? `<span class="sub">${template === "compact" ? " · " : ""}${esc(entry.subtitle)}</span>` : ""}</div>
            ${entry.period ? `<div class="period">${esc(entry.period)}</div>` : ""}
          </div>
          ${bullets.length ? `<ul>${bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>` : ""}
        </div>`;
      })
      .join("");
  } else if (section.kind === "list") {
    const items = listItems(section.content);
    inner = items.length ? `<ul class="tags">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  } else {
    inner = section.content.trim() ? `<p class="text">${esc(section.content).replaceAll("\n", "<br>")}</p>` : "";
  }
  if (!inner) return "";
  return `<section><h2>${esc(section.title)}</h2>${inner}</section>`;
}

const BASE_CSS = `
.cv { font-size: 12.5px; line-height: 1.45; }
.cv h1 { margin: 0; line-height: 1.1; }
.cv h2 { margin: 0 0 6px; }
.cv section { margin-top: 16px; }
.cv .entry { margin-bottom: 10px; break-inside: avoid; }
.cv .entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.cv .sub { color: #4b4d55; }
.cv .period { color: #4b4d55; white-space: nowrap; font-size: 11.5px; }
.cv ul { margin: 4px 0 0; padding-left: 18px; }
.cv li { margin: 1px 0; }
.cv .tags { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 6px; }
.cv .text { margin: 0; }
.cv .contact { color: #3f4046; }
`;

const TEMPLATE_CSS: Record<ResumeTemplate, (accent: string) => string> = {
  classic: (accent) => `
    .cv header { text-align: center; border-bottom: 2px solid ${accent}; padding-bottom: 10px; }
    .cv h1 { font-family: Georgia, "Times New Roman", serif; font-size: 30px; font-weight: 600; }
    .cv .headline { font-size: 14px; color: ${accent}; margin-top: 4px; }
    .cv .contact { margin-top: 6px; }
    .cv h2 { font-family: Georgia, "Times New Roman", serif; font-size: 15px; text-transform: uppercase; letter-spacing: 0.12em; color: ${accent}; border-bottom: 1px solid #d4d4d8; padding-bottom: 3px; }
    .cv .sub::before { content: " · "; color: #9a9ba3; }
    .cv .tags li:not(:last-child)::after { content: " ·"; color: #9a9ba3; }
  `,
  modern: (accent) => `
    .cv { display: grid; grid-template-columns: 34% 1fr; gap: 0 24px; }
    .cv header { grid-column: 1 / -1; background: ${accent}; color: #fff; padding: 18px 20px; border-radius: 6px; margin-bottom: 4px; }
    .cv header .contact { color: #f1f5ea; }
    .cv h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }
    .cv .headline { font-size: 14px; opacity: 0.92; margin-top: 2px; }
    .cv .side section, .cv .main section { margin-top: 14px; }
    .cv h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: ${accent}; }
    .cv .sub { display: block; }
    .cv .side .tags { display: block; }
    .cv .side .tags li { padding: 2px 0; border-bottom: 1px solid #ececef; }
  `,
  compact: (accent) => `
    .cv { font-size: 11.5px; }
    .cv header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 3px solid ${accent}; padding-bottom: 8px; }
    .cv h1 { font-size: 24px; font-weight: 800; }
    .cv .headline { color: ${accent}; font-weight: 600; }
    .cv header .contact { text-align: right; font-size: 11px; }
    .cv section { margin-top: 10px; display: grid; grid-template-columns: 120px 1fr; gap: 12px; }
    .cv h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: ${accent}; padding-top: 2px; }
    .cv .entry { margin-bottom: 6px; }
    .cv .tags li { background: #f1f2ee; border-radius: 3px; padding: 1px 6px; }
  `,
};

/** The resume as a standalone HTML document (preview and print). */
export function resumeDocument(data: ResumeData): string {
  const { basics } = data;
  const accent = safeColor(data.accent);
  const contact = [basics.email, basics.phone, basics.location, ...listItems(basics.links)].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
  const header = `<header>
    <div>
      <h1>${esc(basics.name) || "Your Name"}</h1>
      ${basics.headline ? `<div class="headline">${esc(basics.headline)}</div>` : ""}
    </div>
    ${contact ? `<div class="contact">${contact}</div>` : ""}
  </header>`;
  const summary = basics.summary.trim() ? `<section><h2>Profile</h2><p class="text">${esc(basics.summary).replaceAll("\n", "<br>")}</p></section>` : "";
  const sections = data.sections.map((section) => sectionHtml(section, data.template));

  let body: string;
  if (data.template === "modern") {
    // Lists (skills, languages) go in the side column; everything else in the main column.
    const side = data.sections.map((section, index) => (section.kind === "list" ? sections[index] : "")).join("");
    const main = summary + data.sections.map((section, index) => (section.kind !== "list" ? sections[index] : "")).join("");
    body = `<div class="cv">${header}<aside class="side">${side}</aside><main class="main">${main}</main></div>`;
  } else {
    body = `<div class="cv">${header}${summary}${sections.join("")}</div>`;
  }
  return htmlDocument({
    title: basics.name ? `${basics.name} resume` : "Resume",
    css: BASE_CSS + TEMPLATE_CSS[data.template](accent),
    body,
    paper: data.paper,
  });
}
