import { AI_CRAWLERS } from "../crawlers.js";
import type { Fetcher } from "../fetch.js";
import { evaluateAccess, parseRobots } from "../parsers/robots.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

interface CrawlerReport {
  name: string;
  vendor: string;
  purpose: string;
  access: "allowed" | "blocked";
  matchedGroup: string | null;
  matchedRule: string | null;
}

export async function checkRobotsTxt(
  fetcher: Fetcher,
  input: { url: string; path?: string },
): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const checkPath = input.path ?? "/";
  const robotsUrl = `${normalized.url.origin}/robots.txt`;

  const res = await fetcher(robotsUrl);
  if (!res.ok) {
    return errorResult(`Could not fetch robots.txt at ${robotsUrl}: ${res.error.message}`);
  }

  const uniform = (access: "allowed" | "blocked"): CrawlerReport[] =>
    AI_CRAWLERS.map((c) => ({
      name: c.name,
      vendor: c.vendor,
      purpose: c.purpose,
      access,
      matchedGroup: null,
      matchedRule: null,
    }));

  if (res.status >= 500) {
    return textResult(
      `robots.txt at ${robotsUrl} returned HTTP ${res.status}. RFC 9309 says an unreachable robots.txt must be treated as complete disallow, so assume every crawler is blocked until the server recovers.`,
      {
        robotsUrl,
        fetched: false,
        status: res.status,
        path: checkPath,
        sitemaps: [],
        groupCount: 0,
        crawlers: uniform("blocked"),
      },
    );
  }

  if (res.status >= 400) {
    return textResult(
      `No robots.txt found at ${robotsUrl} (HTTP ${res.status}). Per RFC 9309 that means no crawling restrictions: all ${AI_CRAWLERS.length} known AI crawlers are allowed.`,
      {
        robotsUrl,
        fetched: false,
        status: res.status,
        path: checkPath,
        sitemaps: [],
        groupCount: 0,
        crawlers: uniform("allowed"),
      },
    );
  }

  const parsed = parseRobots(res.body);
  const crawlers: CrawlerReport[] = AI_CRAWLERS.map((c) => {
    const access = evaluateAccess(parsed, c.name, checkPath);
    return { name: c.name, vendor: c.vendor, purpose: c.purpose, ...access };
  });

  const blocked = crawlers.filter((c) => c.access === "blocked");
  const allowed = crawlers.filter((c) => c.access === "allowed");
  const lines = [
    `robots.txt for ${normalized.url.origin} (path checked: ${checkPath})`,
    `Blocked AI crawlers (${blocked.length}/${crawlers.length}): ${blocked.map((c) => `${c.name} [${c.vendor}]`).join(", ") || "none"}`,
    `Allowed AI crawlers (${allowed.length}/${crawlers.length}): ${allowed.map((c) => c.name).join(", ") || "none"}`,
  ];
  if (parsed.sitemaps.length > 0) lines.push(`Sitemaps: ${parsed.sitemaps.join(", ")}`);

  return textResult(lines.join("\n"), {
    robotsUrl,
    fetched: true,
    status: res.status,
    path: checkPath,
    sitemaps: parsed.sitemaps,
    groupCount: parsed.groups.length,
    crawlers,
  });
}
