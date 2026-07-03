import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractJsonLd } from "../src/parsers/json-ld.js";

const page = readFileSync(new URL("./fixtures/article-page.html", import.meta.url), "utf8");

describe("extractJsonLd", () => {
  it("extracts types across @graph, arrays, and multiple blocks, counting parse errors", () => {
    const r = extractJsonLd(page);
    expect(r.blockCount).toBe(3);
    expect(r.parseErrors).toBe(1);
    expect(r.typeCounts["Organization"]).toBe(1);
    expect(r.typeCounts["WebSite"]).toBe(1);
    expect(r.typeCounts["NewsArticle"]).toBe(1);
  });

  it("records entity names and sameAs presence", () => {
    const r = extractJsonLd(page);
    const org = r.entities.find((e) => e.types.includes("Organization"));
    expect(org?.name).toBe("Example News");
    expect(org?.hasSameAs).toBe(true);
    const site = r.entities.find((e) => e.types.includes("WebSite"));
    expect(site?.hasSameAs).toBe(false);
  });

  it("handles a top-level array of nodes", () => {
    const html = `<script type="application/ld+json">[{"@type":"FAQPage"},{"@type":"BreadcrumbList"}]</script>`;
    const r = extractJsonLd(html);
    expect(r.typeCounts["FAQPage"]).toBe(1);
    expect(r.typeCounts["BreadcrumbList"]).toBe(1);
  });

  it("returns zeros for a page with no JSON-LD", () => {
    const r = extractJsonLd("<html><body>plain</body></html>");
    expect(r.blockCount).toBe(0);
    expect(r.parseErrors).toBe(0);
    expect(Object.keys(r.typeCounts)).toEqual([]);
  });

  it("ignores script tags of other types", () => {
    const r = extractJsonLd(`<script type="text/javascript">var x = {"@type":"Organization"};</script>`);
    expect(r.blockCount).toBe(0);
  });

  it("treats sameAs given as a single string as present", () => {
    const html = `<script type="application/ld+json">{"@type":"Person","name":"Nick","sameAs":"https://linkedin.com/in/x"}</script>`;
    const r = extractJsonLd(html);
    expect(r.entities[0].hasSameAs).toBe(true);
  });
});
