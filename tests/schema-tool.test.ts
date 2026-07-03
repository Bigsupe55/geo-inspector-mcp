import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectSchemaMarkup } from "../src/tools/schema-markup.js";
import { okResponse, stubFetcher } from "./helpers.js";

const page = readFileSync(new URL("./fixtures/article-page.html", import.meta.url), "utf8");

describe("detectSchemaMarkup", () => {
  it("inventories types and computes the AI-relevant checklist", async () => {
    const fetcher = stubFetcher({
      "https://example.com/article": okResponse(page, { headers: { "content-type": "text/html" } }),
    });
    const result = await detectSchemaMarkup(fetcher, { url: "example.com/article" });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      blockCount: number;
      parseErrors: number;
      typeCounts: Record<string, number>;
      aiRelevant: Record<string, boolean>;
    };
    expect(sc.blockCount).toBe(3);
    expect(sc.parseErrors).toBe(1);
    expect(sc.aiRelevant["Organization"]).toBe(true);
    expect(sc.aiRelevant["Article"]).toBe(true); // NewsArticle counts as Article
    expect(sc.aiRelevant["FAQPage"]).toBe(false);
    expect(result.content[0].text).toContain("Organization");
  });

  it("reports a page with no structured data as a normal finding", async () => {
    const fetcher = stubFetcher({
      "https://example.com/": okResponse("<html><body>hi</body></html>", { headers: { "content-type": "text/html" } }),
    });
    const result = await detectSchemaMarkup(fetcher, { url: "example.com" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.toLowerCase()).toContain("no json-ld");
  });

  it("rejects non-HTML responses", async () => {
    const fetcher = stubFetcher({
      "https://example.com/image": okResponse("binary", { headers: { "content-type": "image/png" } }),
    });
    const result = await detectSchemaMarkup(fetcher, { url: "example.com/image" });
    expect(result.isError).toBe(true);
  });

  it("returns isError for HTTP error statuses", async () => {
    const fetcher = stubFetcher({
      "https://example.com/gone": okResponse("gone", { status: 410, headers: { "content-type": "text/html" } }),
    });
    const result = await detectSchemaMarkup(fetcher, { url: "example.com/gone" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("410");
  });
});
