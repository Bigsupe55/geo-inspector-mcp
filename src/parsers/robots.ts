export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface AccessResult {
  access: "allowed" | "blocked";
  matchedGroup: string | null;
  matchedRule: string | null;
}

export function parseRobots(content: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let currentGroup: RobotsGroup | null = null;
  let lastLineWasUserAgent = false;

  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = withoutBom.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!lastLineWasUserAgent || currentGroup === null) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
      }
      if (value !== "") currentGroup.agents.push(value.toLowerCase());
      lastLineWasUserAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastLineWasUserAgent = false;
      if (currentGroup !== null) currentGroup.rules.push({ type: key, path: value });
    } else {
      lastLineWasUserAgent = false;
      if (key === "sitemap" && value !== "") sitemaps.push(value);
    }
  }
  return { groups, sitemaps };
}

export function evaluateAccess(robots: ParsedRobots, agent: string, path: string): AccessResult {
  const wanted = agent.toLowerCase();
  let group = robots.groups.find((g) => g.agents.includes(wanted));
  let matchedGroup: string | null = group !== undefined ? agent : null;
  if (group === undefined) {
    group = robots.groups.find((g) => g.agents.includes("*"));
    matchedGroup = group !== undefined ? "*" : null;
  }
  if (group === undefined) {
    return { access: "allowed", matchedGroup: null, matchedRule: null };
  }

  let best: { rule: RobotsRule; specificity: number } | null = null;
  for (const rule of group.rules) {
    if (rule.path === "") continue; // an empty Disallow matches nothing (allows everything)
    if (!pathMatches(rule.path, path)) continue;
    const specificity = rule.path.length;
    if (
      best === null ||
      specificity > best.specificity ||
      (specificity === best.specificity && rule.type === "allow" && best.rule.type === "disallow")
    ) {
      best = { rule, specificity };
    }
  }
  if (best === null) {
    return { access: "allowed", matchedGroup, matchedRule: null };
  }
  return {
    access: best.rule.type === "allow" ? "allowed" : "blocked",
    matchedGroup,
    matchedRule: `${best.rule.type === "allow" ? "Allow" : "Disallow"}: ${best.rule.path}`,
  };
}

function pathMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = core.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}
