import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateAccess, parseRobots } from "../src/parsers/robots.js";

const publisher = readFileSync(new URL("./fixtures/robots-publisher.txt", import.meta.url), "utf8");

describe("parseRobots", () => {
  it("parses groups, shared user-agent lines, and sitemaps", () => {
    const parsed = parseRobots(publisher);
    expect(parsed.groups.length).toBe(4);
    expect(parsed.groups[1].agents).toEqual(["gptbot", "ccbot", "anthropic-ai"]);
    expect(parsed.sitemaps).toEqual([
      "https://example-publisher.com/sitemap.xml",
      "https://example-publisher.com/news-sitemap.xml",
    ]);
  });

  it("strips comments, tolerates BOM and CRLF, ignores unknown directives", () => {
    const bom = String.fromCharCode(0xfeff);
    const parsed = parseRobots(bom + "User-agent: *\r\nCrawl-delay: 5\r\nDisallow: /x # inline comment\r\n");
    expect(parsed.groups.length).toBe(1);
    expect(parsed.groups[0].rules).toEqual([{ type: "disallow", path: "/x" }]);
  });

  it("returns no groups for an empty file", () => {
    expect(parseRobots("").groups).toEqual([]);
  });
});

describe("evaluateAccess", () => {
  const parsed = parseRobots(publisher);

  it("blocks agents with a dedicated Disallow: / group", () => {
    const r = evaluateAccess(parsed, "GPTBot", "/");
    expect(r.access).toBe("blocked");
    expect(r.matchedGroup).toBe("GPTBot");
    expect(r.matchedRule).toBe("Disallow: /");
  });

  it("matches agent names case-insensitively", () => {
    expect(evaluateAccess(parsed, "gptbot", "/").access).toBe("blocked");
  });

  it("falls back to the * group for unlisted agents", () => {
    const r = evaluateAccess(parsed, "ClaudeBot", "/some-article");
    expect(r.access).toBe("allowed");
    expect(r.matchedGroup).toBe("*");
  });

  it("applies longest-match precedence (Allow beats shorter Disallow)", () => {
    const r = evaluateAccess(parsed, "SomeBot", "/search/about");
    expect(r.access).toBe("allowed");
    expect(r.matchedRule).toBe("Allow: /search/about");
  });

  it("blocks on the shorter Disallow when the Allow does not match", () => {
    expect(evaluateAccess(parsed, "SomeBot", "/search?q=x").access).toBe("blocked");
  });

  it("allows everything when no group matches at all", () => {
    const none = parseRobots("User-agent: OnlyBot\nDisallow: /\n");
    const r = evaluateAccess(none, "OtherBot", "/");
    expect(r.access).toBe("allowed");
    expect(r.matchedGroup).toBeNull();
  });

  it("treats an empty Disallow as allow-all", () => {
    const p = parseRobots("User-agent: *\nDisallow:\n");
    expect(evaluateAccess(p, "AnyBot", "/anything").access).toBe("allowed");
  });

  it("supports * wildcards in paths", () => {
    const p = parseRobots("User-agent: *\nDisallow: /private*/data\n");
    expect(evaluateAccess(p, "AnyBot", "/private-stuff/data").access).toBe("blocked");
    expect(evaluateAccess(p, "AnyBot", "/private-stuff/other").access).toBe("allowed");
  });

  it("supports $ end anchors", () => {
    const p = parseRobots("User-agent: *\nDisallow: /*.pdf$\n");
    expect(evaluateAccess(p, "AnyBot", "/file.pdf").access).toBe("blocked");
    expect(evaluateAccess(p, "AnyBot", "/file.pdf.html").access).toBe("allowed");
  });

  it("prefers Allow on an exact-length tie", () => {
    const p = parseRobots("User-agent: *\nDisallow: /page\nAllow: /page\n");
    expect(evaluateAccess(p, "AnyBot", "/page").access).toBe("allowed");
  });
});
