import { describe, expect, it } from "vitest";
import { looksLikeHtml, parseLlmsTxt } from "../src/parsers/llms-txt.js";

const VALID = `# Example Project

> Example is a sample project that demonstrates llms.txt.

Some free-form context is allowed here.

## Docs

- [Quickstart](https://example.com/quickstart): Get going in 5 minutes
- [API Reference](https://example.com/api)

## Optional

- [Changelog](https://example.com/changelog)
`;

describe("parseLlmsTxt", () => {
  it("accepts a spec-conformant file", () => {
    const r = parseLlmsTxt(VALID);
    expect(r.valid).toBe(true);
    expect(r.title).toBe("Example Project");
    expect(r.hasSummary).toBe(true);
    expect(r.sections).toEqual([
      { name: "Docs", linkCount: 2 },
      { name: "Optional", linkCount: 1 },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it("flags a missing H1 as invalid", () => {
    const r = parseLlmsTxt("Just some text\n\n## Section\n- [a](https://a.example)\n");
    expect(r.valid).toBe(false);
    expect(r.title).toBeNull();
    expect(r.warnings.some((w) => w.includes("H1"))).toBe(true);
  });

  it("warns about content before the H1", () => {
    const r = parseLlmsTxt("stray line\n# Title\n");
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes("before the H1"))).toBe(true);
  });

  it("warns about sections without links", () => {
    const r = parseLlmsTxt("# Title\n\n## Empty Section\n\njust prose\n");
    expect(r.warnings.some((w) => w.includes("Empty Section"))).toBe(true);
  });

  it("detects an HTML error page served as llms.txt", () => {
    const r = parseLlmsTxt("<!DOCTYPE html><html><body>404</body></html>");
    expect(r.valid).toBe(false);
    expect(r.warnings.some((w) => w.toLowerCase().includes("html"))).toBe(true);
  });

  it("handles an empty file", () => {
    const r = parseLlmsTxt("");
    expect(r.valid).toBe(false);
  });

  it("does not mistake an H2 for the H1 title", () => {
    const r = parseLlmsTxt("## Not A Title\n");
    expect(r.title).toBeNull();
  });
});

describe("looksLikeHtml", () => {
  it("detects doctype and html openings", () => {
    expect(looksLikeHtml("  <!doctype html><html>")).toBe(true);
    expect(looksLikeHtml("<HTML>")).toBe(true);
    expect(looksLikeHtml("# Just Markdown")).toBe(false);
  });
});
