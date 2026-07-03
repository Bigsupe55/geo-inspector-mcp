import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRobotsTxt } from "../src/tools/robots.js";
import { okResponse, stubFetcher } from "./helpers.js";

const publisher = readFileSync(new URL("./fixtures/robots-publisher.txt", import.meta.url), "utf8");

describe("checkRobotsTxt", () => {
  it("reports blocked and allowed AI crawlers from a real-shaped robots.txt", async () => {
    const fetcher = stubFetcher({ "https://example-publisher.com/robots.txt": okResponse(publisher) });
    const result = await checkRobotsTxt(fetcher, { url: "example-publisher.com" });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      crawlers: Array<{ name: string; access: string }>;
      sitemaps: string[];
      groupCount: number;
    };
    const byName = Object.fromEntries(sc.crawlers.map((c) => [c.name, c.access]));
    expect(byName["GPTBot"]).toBe("blocked");
    expect(byName["CCBot"]).toBe("blocked");
    expect(byName["Google-Extended"]).toBe("blocked");
    expect(byName["ClaudeBot"]).toBe("allowed");
    expect(sc.groupCount).toBe(4);
    expect(sc.sitemaps.length).toBe(2);
    expect(result.content[0].text).toContain("GPTBot");
  });

  it("treats 404 as no restrictions per RFC 9309", async () => {
    const fetcher = stubFetcher({ "https://example.com/robots.txt": okResponse("nope", { status: 404 }) });
    const result = await checkRobotsTxt(fetcher, { url: "https://example.com" });
    const sc = result.structuredContent as { fetched: boolean; crawlers: Array<{ access: string }> };
    expect(sc.fetched).toBe(false);
    expect(sc.crawlers.every((c) => c.access === "allowed")).toBe(true);
  });

  it("treats 5xx as complete disallow per RFC 9309", async () => {
    const fetcher = stubFetcher({ "https://example.com/robots.txt": okResponse("err", { status: 503 }) });
    const result = await checkRobotsTxt(fetcher, { url: "example.com" });
    const sc = result.structuredContent as { crawlers: Array<{ access: string }> };
    expect(sc.crawlers.every((c) => c.access === "blocked")).toBe(true);
  });

  it("evaluates a custom path", async () => {
    const robots = "User-agent: GPTBot\nDisallow: /private/\n";
    const fetcher = stubFetcher({ "https://example.com/robots.txt": okResponse(robots) });
    const result = await checkRobotsTxt(fetcher, { url: "example.com", path: "/private/doc" });
    const sc = result.structuredContent as { crawlers: Array<{ name: string; access: string }> };
    const gpt = sc.crawlers.find((c) => c.name === "GPTBot");
    expect(gpt?.access).toBe("blocked");
  });

  it("returns isError for invalid URLs", async () => {
    const result = await checkRobotsTxt(stubFetcher({}), { url: "ftp://x" });
    expect(result.isError).toBe(true);
  });

  it("returns isError for network failures", async () => {
    const result = await checkRobotsTxt(stubFetcher({}), { url: "unreachable.example" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("robots.txt");
  });
});
