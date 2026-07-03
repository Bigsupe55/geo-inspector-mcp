export interface LlmsTxtSection {
  name: string;
  linkCount: number;
}

export interface LlmsTxtValidation {
  valid: boolean;
  title: string | null;
  hasSummary: boolean;
  sections: LlmsTxtSection[];
  warnings: string[];
}

const LINK_LINE = /^\s*[-*]\s*\[[^\]]+\]\([^)]+\)/;

export function looksLikeHtml(content: string): boolean {
  const head = content.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml");
}

export function parseLlmsTxt(content: string): LlmsTxtValidation {
  const warnings: string[] = [];
  if (looksLikeHtml(content)) {
    return {
      valid: false,
      title: null,
      hasSummary: false,
      sections: [],
      warnings: [
        "Response looks like an HTML page. The server is probably returning an error page instead of a plain-text llms.txt.",
      ],
    };
  }

  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = withoutBom.split(/\r?\n/);

  let title: string | null = null;
  let titleLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+)$/);
    if (m !== null) {
      title = m[1].trim();
      titleLine = i;
      break;
    }
  }

  if (title === null) {
    warnings.push("Missing H1 title. The llms.txt spec requires the file to start with `# Site Name`.");
  } else if (lines.slice(0, titleLine).some((l) => l.trim() !== "")) {
    warnings.push("Content appears before the H1 title.");
  }

  let hasSummary = false;
  if (titleLine !== -1) {
    for (let i = titleLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      hasSummary = line.startsWith(">");
      break;
    }
  }

  const sections: LlmsTxtSection[] = [];
  let current: LlmsTxtSection | null = null;
  for (let i = titleLine + 1; i < lines.length; i++) {
    const h2 = lines[i].match(/^##\s+(.+)$/);
    if (h2 !== null) {
      current = { name: h2[1].trim(), linkCount: 0 };
      sections.push(current);
    } else if (current !== null && LINK_LINE.test(lines[i])) {
      current.linkCount++;
    }
  }
  for (const section of sections) {
    if (section.linkCount === 0) {
      warnings.push(`Section "${section.name}" contains no links.`);
    }
  }

  return { valid: title !== null, title, hasSummary, sections, warnings };
}
