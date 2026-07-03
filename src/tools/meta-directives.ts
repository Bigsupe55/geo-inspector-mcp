import type { Fetcher } from "../fetch.js";
import { isHtmlContentType } from "../fetch.js";
import { parseMetaDirectives } from "../parsers/meta-robots.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

export async function checkMetaDirectives(fetcher: Fetcher, input: { url: string }): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const pageUrl = normalized.url.toString();

  const res = await fetcher(pageUrl);
  if (!res.ok) return errorResult(`Could not fetch ${pageUrl}: ${res.error.message}`);
  if (res.status >= 400) return errorResult(`Fetching ${pageUrl} returned HTTP ${res.status}.`);
  if (!isHtmlContentType(res.headers.get("content-type"))) {
    return errorResult(
      `The response from ${pageUrl} is ${res.headers.get("content-type") ?? "unknown"}, not HTML. Meta directive inspection needs an HTML page.`,
    );
  }

  const headerValue = res.headers.get("x-robots-tag");
  const parsed = parseMetaDirectives(res.body, headerValue === null ? [] : [headerValue]);

  const lines = [
    `Indexing directives for ${pageUrl}`,
    `Page is ${parsed.summary.indexable ? "indexable" : "NOT indexable"} and links are ${parsed.summary.followable ? "followable" : "NOT followable"}.`,
  ];
  if (parsed.metaTags.length > 0) {
    lines.push(`Meta tags: ${parsed.metaTags.map((t) => `${t.name}=[${t.directives.join(" ")}]`).join(", ")}`);
  }
  if (parsed.xRobotsTag.length > 0) {
    lines.push(
      `X-Robots-Tag: ${parsed.xRobotsTag.map((e) => `${e.agent ?? "(all agents)"}=[${e.directives.join(" ")}]`).join(", ")}`,
    );
  }
  lines.push(
    parsed.summary.aiDirectives.length > 0
      ? `AI-specific restrictions: ${parsed.summary.aiDirectives.join(", ")}`
      : "No AI-specific restrictions found.",
  );

  return textResult(lines.join("\n"), {
    pageUrl,
    status: res.status,
    metaTags: parsed.metaTags,
    xRobotsTag: parsed.xRobotsTag,
    summary: parsed.summary,
  });
}
