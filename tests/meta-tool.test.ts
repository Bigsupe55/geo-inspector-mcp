import { describe, expect, it } from "vitest";
import { checkMetaDirectives } from "../src/tools/meta-directives.js";
import { okResponse, stubFetcher } from "./helpers.js";

describe("checkMetaDirectives", () => {
  it("combines meta tags and X-Robots-Tag headers into one report", async () => {
    const fetcher = stubFetcher({
      "https://example.com/": okResponse(
        `<meta name="robots" content="noindex"><meta name="GPTBot" content="noindex">`,
        {
          headers: { "content-type": "text/html", "x-robots-tag": "noai" },
        },
      ),
    });
    const result = await checkMetaDirectives(fetcher, { url: "example.com" });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      summary: { indexable: boolean; aiDirectives: string[] };
      metaTags: unknown[];
      xRobotsTag: unknown[];
    };
    expect(sc.summary.indexable).toBe(false);
    expect(sc.summary.aiDirectives).toContain("noai");
    expect(sc.summary.aiDirectives).toContain("gptbot:noindex");
    expect(result.content[0].text.toLowerCase()).toContain("not indexable");
  });

  it("reports a clean page as indexable with no AI restrictions", async () => {
    const fetcher = stubFetcher({
      "https://example.com/": okResponse("<html><head></head><body>hi</body></html>", {
        headers: { "content-type": "text/html" },
      }),
    });
    const result = await checkMetaDirectives(fetcher, { url: "example.com" });
    const sc = result.structuredContent as { summary: { indexable: boolean; aiDirectives: string[] } };
    expect(sc.summary.indexable).toBe(true);
    expect(sc.summary.aiDirectives).toEqual([]);
  });

  it("rejects non-HTML pages", async () => {
    const fetcher = stubFetcher({
      "https://example.com/f.pdf": okResponse("pdf", { headers: { "content-type": "application/pdf" } }),
    });
    const result = await checkMetaDirectives(fetcher, { url: "example.com/f.pdf" });
    expect(result.isError).toBe(true);
  });

  it("returns isError for HTTP error statuses", async () => {
    const fetcher = stubFetcher({
      "https://example.com/gone": okResponse("x", { status: 404, headers: { "content-type": "text/html" } }),
    });
    const result = await checkMetaDirectives(fetcher, { url: "example.com/gone" });
    expect(result.isError).toBe(true);
  });
});
