import { parse } from "node-html-parser";
import { AI_CRAWLERS } from "../crawlers.js";

export interface MetaTagDirectives {
  name: string;
  directives: string[];
}

export interface XRobotsTagEntry {
  agent: string | null;
  directives: string[];
}

export interface MetaDirectivesSummary {
  indexable: boolean;
  followable: boolean;
  aiDirectives: string[];
}

export interface MetaDirectivesResult {
  metaTags: MetaTagDirectives[];
  xRobotsTag: XRobotsTagEntry[];
  summary: MetaDirectivesSummary;
}

const AI_AGENT_NAMES = new Set(AI_CRAWLERS.map((c) => c.name.toLowerCase()));
const GENERIC_BOT_NAMES = new Set(["robots", "googlebot", "bingbot"]);
const AI_CONTENT_DIRECTIVES = new Set(["noai", "noimageai"]);
const KNOWN_DIRECTIVES = new Set([
  "all",
  "noindex",
  "nofollow",
  "none",
  "noarchive",
  "nosnippet",
  "notranslate",
  "noimageindex",
  "indexifembedded",
  "noai",
  "noimageai",
]);

export function parseMetaDirectives(html: string, xRobotsHeaderValues: string[]): MetaDirectivesResult {
  const root = parse(html);
  const metaTags: MetaTagDirectives[] = [];

  for (const meta of root.querySelectorAll("meta")) {
    const name = (meta.getAttribute("name") ?? "").toLowerCase().trim();
    if (name === "") continue;
    if (GENERIC_BOT_NAMES.has(name) || AI_AGENT_NAMES.has(name)) {
      const content = (meta.getAttribute("content") ?? "").toLowerCase();
      const directives = content
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d !== "");
      if (directives.length > 0) metaTags.push({ name, directives });
    } else if (AI_CONTENT_DIRECTIVES.has(name)) {
      metaTags.push({ name, directives: [name] });
    }
  }

  const xRobotsTag = xRobotsHeaderValues.flatMap(parseXRobotsValue);

  const globalDirectives = new Set<string>();
  for (const tag of metaTags) {
    if (tag.name === "robots") for (const d of tag.directives) globalDirectives.add(d);
  }
  for (const entry of xRobotsTag) {
    if (entry.agent === null) for (const d of entry.directives) globalDirectives.add(d);
  }

  const aiDirectives = new Set<string>();
  for (const tag of metaTags) {
    for (const d of tag.directives) {
      if (AI_CONTENT_DIRECTIVES.has(d)) aiDirectives.add(d);
      if (AI_AGENT_NAMES.has(tag.name)) aiDirectives.add(`${tag.name}:${d}`);
    }
  }
  for (const entry of xRobotsTag) {
    for (const d of entry.directives) {
      if (AI_CONTENT_DIRECTIVES.has(d)) aiDirectives.add(d);
      if (entry.agent !== null && AI_AGENT_NAMES.has(entry.agent)) aiDirectives.add(`${entry.agent}:${d}`);
    }
  }

  return {
    metaTags,
    xRobotsTag,
    summary: {
      indexable: !globalDirectives.has("noindex") && !globalDirectives.has("none"),
      followable: !globalDirectives.has("nofollow") && !globalDirectives.has("none"),
      aiDirectives: [...aiDirectives].sort(),
    },
  };
}

function parseXRobotsValue(value: string): XRobotsTagEntry[] {
  const entries: XRobotsTagEntry[] = [];
  let current: XRobotsTagEntry | null = null;
  for (const rawToken of value.split(",")) {
    const token = rawToken.trim().toLowerCase();
    if (token === "") continue;
    const colon = token.indexOf(":");
    const prefix = colon === -1 ? "" : token.slice(0, colon).trim();
    const isAgentPrefix =
      colon !== -1 && !KNOWN_DIRECTIVES.has(prefix) && !prefix.startsWith("max-") && prefix !== "unavailable_after";
    if (isAgentPrefix) {
      const first = token.slice(colon + 1).trim();
      current = { agent: prefix, directives: first === "" ? [] : [first] };
      entries.push(current);
    } else if (current !== null) {
      current.directives.push(token);
    } else {
      current = { agent: null, directives: [token] };
      entries.push(current);
    }
  }
  return entries;
}
