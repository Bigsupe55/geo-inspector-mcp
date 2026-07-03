import { describe, expect, it } from "vitest";
import { parseMetaDirectives } from "../src/parsers/meta-robots.js";

describe("parseMetaDirectives", () => {
  it("parses a robots meta tag into directives", () => {
    const r = parseMetaDirectives(`<meta name="robots" content="noindex, nofollow">`, []);
    expect(r.metaTags).toEqual([{ name: "robots", directives: ["noindex", "nofollow"] }]);
    expect(r.summary.indexable).toBe(false);
    expect(r.summary.followable).toBe(false);
  });

  it("defaults to indexable and followable when nothing restricts", () => {
    const r = parseMetaDirectives(`<meta name="description" content="hi">`, []);
    expect(r.metaTags).toEqual([]);
    expect(r.summary.indexable).toBe(true);
    expect(r.summary.followable).toBe(true);
  });

  it("captures bot-specific meta tags and flags AI-agent restrictions", () => {
    const html = `<meta name="GPTBot" content="noindex"><meta name="googlebot" content="nosnippet">`;
    const r = parseMetaDirectives(html, []);
    expect(r.metaTags).toContainEqual({ name: "gptbot", directives: ["noindex"] });
    expect(r.summary.aiDirectives).toContain("gptbot:noindex");
    // A crawler-specific noindex does not make the page globally non-indexable
    expect(r.summary.indexable).toBe(true);
  });

  it("detects standalone noai meta tags and noai inside robots content", () => {
    const html = `<meta name="noai"><meta name="robots" content="noai, noimageai">`;
    const r = parseMetaDirectives(html, []);
    expect(r.summary.aiDirectives).toContain("noai");
    expect(r.summary.aiDirectives).toContain("noimageai");
  });

  it("parses agentless X-Robots-Tag headers", () => {
    const r = parseMetaDirectives("<html></html>", ["noindex, noarchive"]);
    expect(r.xRobotsTag).toEqual([{ agent: null, directives: ["noindex", "noarchive"] }]);
    expect(r.summary.indexable).toBe(false);
  });

  it("parses agent-prefixed X-Robots-Tag headers", () => {
    const r = parseMetaDirectives("<html></html>", ["googlebot: noindex, nofollow"]);
    expect(r.xRobotsTag).toEqual([{ agent: "googlebot", directives: ["noindex", "nofollow"] }]);
    expect(r.summary.indexable).toBe(true); // scoped to googlebot only
  });

  it("flags AI agents restricted via X-Robots-Tag", () => {
    const r = parseMetaDirectives("<html></html>", ["gptbot: noindex"]);
    expect(r.summary.aiDirectives).toContain("gptbot:noindex");
  });

  it("treats none as noindex plus nofollow", () => {
    const r = parseMetaDirectives(`<meta name="robots" content="none">`, []);
    expect(r.summary.indexable).toBe(false);
    expect(r.summary.followable).toBe(false);
  });
});
