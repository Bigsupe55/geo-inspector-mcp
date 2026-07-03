import type { Fetcher } from "../fetch.js";
import { isHtmlContentType } from "../fetch.js";
import { extractJsonLd } from "../parsers/json-ld.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

const AI_RELEVANT = ["Organization", "WebSite", "Article", "FAQPage", "BreadcrumbList", "Person"] as const;
const ARTICLE_TYPES = ["Article", "NewsArticle", "BlogPosting"];

export async function detectSchemaMarkup(fetcher: Fetcher, input: { url: string }): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const pageUrl = normalized.url.toString();

  const res = await fetcher(pageUrl);
  if (!res.ok) return errorResult(`Could not fetch ${pageUrl}: ${res.error.message}`);
  if (res.status >= 400) return errorResult(`Fetching ${pageUrl} returned HTTP ${res.status}.`);
  if (!isHtmlContentType(res.headers.get("content-type"))) {
    return errorResult(
      `The response from ${pageUrl} is ${res.headers.get("content-type") ?? "unknown"}, not HTML, so it cannot contain schema markup.`,
    );
  }

  const extracted = extractJsonLd(res.body);

  const aiRelevant: Record<string, boolean> = {};
  for (const key of AI_RELEVANT) {
    aiRelevant[key] =
      key === "Article"
        ? ARTICLE_TYPES.some((t) => (extracted.typeCounts[t] ?? 0) > 0)
        : (extracted.typeCounts[key] ?? 0) > 0;
  }

  const found = Object.entries(extracted.typeCounts)
    .map(([type, count]) => (count > 1 ? `${type} x${count}` : type))
    .join(", ");
  const missing = AI_RELEVANT.filter((k) => !aiRelevant[k]).join(", ");
  const lines: string[] = [];
  if (extracted.blockCount === 0) {
    lines.push(`No JSON-LD structured data found on ${pageUrl}.`);
  } else {
    lines.push(
      `JSON-LD on ${pageUrl}: ${extracted.blockCount} block(s), types: ${found === "" ? "none with @type" : found}`,
    );
  }
  if (extracted.parseErrors > 0) {
    lines.push(`${extracted.parseErrors} block(s) failed to parse as JSON.`);
  }
  if (missing !== "") {
    lines.push(`AI-relevant types not found: ${missing}`);
  }
  const disambiguated = extracted.entities.filter(
    (e) => e.hasSameAs && e.types.some((t) => t === "Organization" || t === "Person"),
  );
  if (disambiguated.length > 0) {
    lines.push(`Entities with sameAs disambiguation: ${disambiguated.map((e) => e.name ?? e.types[0]).join(", ")}`);
  }

  return textResult(lines.join("\n"), {
    pageUrl,
    blockCount: extracted.blockCount,
    parseErrors: extracted.parseErrors,
    typeCounts: extracted.typeCounts,
    aiRelevant,
    entities: extracted.entities,
  });
}
