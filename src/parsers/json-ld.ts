import { parse } from "node-html-parser";

export interface JsonLdEntity {
  types: string[];
  name: string | null;
  hasSameAs: boolean;
}

export interface JsonLdResult {
  blockCount: number;
  parseErrors: number;
  errors: string[];
  typeCounts: Record<string, number>;
  entities: JsonLdEntity[];
}

export function extractJsonLd(html: string): JsonLdResult {
  const root = parse(html);
  const scripts = root
    .querySelectorAll("script")
    .filter((s) => (s.getAttribute("type") ?? "").toLowerCase().trim() === "application/ld+json");

  const result: JsonLdResult = {
    blockCount: scripts.length,
    parseErrors: 0,
    errors: [],
    typeCounts: {},
    entities: [],
  };

  for (const script of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(script.text);
    } catch (err) {
      result.parseErrors++;
      result.errors.push(err instanceof Error ? err.message : String(err));
      continue;
    }
    for (const node of flattenNodes(data)) {
      recordNode(node, result);
    }
  }
  return result;
}

function flattenNodes(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.flatMap(flattenNodes);
  if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const nodes: Record<string, unknown>[] = [obj];
    if (Array.isArray(obj["@graph"])) {
      nodes.push(...(obj["@graph"] as unknown[]).flatMap(flattenNodes));
    }
    return nodes;
  }
  return [];
}

function recordNode(node: Record<string, unknown>, result: JsonLdResult): void {
  const rawType = node["@type"];
  const types = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  if (types.length === 0) return;
  for (const t of types) {
    result.typeCounts[t] = (result.typeCounts[t] ?? 0) + 1;
  }
  const sameAs = node["sameAs"];
  result.entities.push({
    types,
    name: typeof node["name"] === "string" ? node["name"] : null,
    hasSameAs: Array.isArray(sameAs) ? sameAs.length > 0 : typeof sameAs === "string",
  });
}
