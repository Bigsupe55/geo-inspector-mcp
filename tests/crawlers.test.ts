import { describe, expect, it } from "vitest";
import { AI_CRAWLERS } from "../src/crawlers.js";

describe("AI_CRAWLERS", () => {
  it("has unique, non-empty names", () => {
    const names = AI_CRAWLERS.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it("covers the major vendors", () => {
    const vendors = new Set(AI_CRAWLERS.map((c) => c.vendor));
    for (const v of ["OpenAI", "Anthropic", "Perplexity", "Google", "Common Crawl"]) {
      expect(vendors).toContain(v);
    }
  });
});
