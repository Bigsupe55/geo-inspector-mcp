import type { Fetcher } from "../fetch.js";
import { looksLikeHtml, parseLlmsTxt } from "../parsers/llms-txt.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

export async function fetchLlmsTxt(fetcher: Fetcher, input: { url: string }): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const origin = normalized.url.origin;

  const files: Record<string, unknown>[] = [];
  const summaryLines: string[] = [];

  for (const file of ["llms.txt", "llms-full.txt"] as const) {
    const url = `${origin}/${file}`;
    const res = await fetcher(url);
    if (!res.ok) {
      return errorResult(`Could not fetch ${url}: ${res.error.message}`);
    }
    if (res.status !== 200) {
      files.push({ file, url, present: false, status: res.status });
      summaryLines.push(`${file}: not found (HTTP ${res.status})`);
      continue;
    }
    const bytes = Buffer.byteLength(res.body, "utf8");
    if (file === "llms.txt") {
      const v = parseLlmsTxt(res.body);
      files.push({
        file,
        url,
        present: true,
        status: res.status,
        bytes,
        valid: v.valid,
        title: v.title,
        hasSummary: v.hasSummary,
        sections: v.sections,
        warnings: v.warnings,
      });
      const state = v.valid ? "valid" : "invalid";
      const warn = v.warnings.length > 0 ? ` (${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"})` : "";
      summaryLines.push(`${file}: present, ${state}${warn}, title: ${v.title ?? "none"}, ${v.sections.length} section(s)`);
    } else {
      // llms-full.txt is expanded content by design: check presence, size, and H1 only.
      const html = looksLikeHtml(res.body);
      const title = parseLlmsTxt(res.body).title;
      const warnings: string[] = [];
      if (html) warnings.push("Response looks like an HTML page instead of plain text.");
      else if (title === null) warnings.push("Missing H1 title.");
      files.push({ file, url, present: true, status: res.status, bytes, valid: title !== null, title, warnings });
      summaryLines.push(`${file}: present (${bytes} bytes)`);
    }
  }

  const anyPresent = files.some((f) => f["present"] === true);
  const header = anyPresent
    ? `llms.txt check for ${origin}`
    : `No llms.txt or llms-full.txt found at ${origin}. The site has not adopted the llms.txt standard.`;

  return textResult([header, ...summaryLines].join("\n"), { files });
}
