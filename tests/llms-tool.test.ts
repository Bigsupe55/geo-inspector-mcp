import { describe, expect, it } from "vitest";
import { fetchLlmsTxt } from "../src/tools/llms-txt.js";
import { okResponse, stubFetcher } from "./helpers.js";

const VALID = "# Example\n\n> Summary here.\n\n## Docs\n- [A](https://a.example): thing\n";

describe("fetchLlmsTxt", () => {
  it("reports a valid llms.txt and a missing llms-full.txt", async () => {
    const fetcher = stubFetcher({
      "https://example.com/llms.txt": okResponse(VALID),
      "https://example.com/llms-full.txt": okResponse("nope", { status: 404 }),
    });
    const result = await fetchLlmsTxt(fetcher, { url: "example.com" });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      files: Array<{ file: string; present: boolean; valid?: boolean; title?: string | null; sections?: unknown[] }>;
    };
    const llms = sc.files.find((f) => f.file === "llms.txt");
    const full = sc.files.find((f) => f.file === "llms-full.txt");
    expect(llms?.present).toBe(true);
    expect(llms?.valid).toBe(true);
    expect(llms?.title).toBe("Example");
    expect(full?.present).toBe(false);
    expect(result.content[0].text).toContain("llms.txt");
  });

  it("treats both files missing as a normal finding, not an error", async () => {
    const fetcher = stubFetcher({
      "https://example.com/llms.txt": okResponse("x", { status: 404 }),
      "https://example.com/llms-full.txt": okResponse("x", { status: 404 }),
    });
    const result = await fetchLlmsTxt(fetcher, { url: "example.com" });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { files: Array<{ present: boolean }> };
    expect(sc.files.every((f) => !f.present)).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain("no llms.txt");
  });

  it("validates llms-full.txt lightly (H1 only)", async () => {
    const fetcher = stubFetcher({
      "https://example.com/llms.txt": okResponse("x", { status: 404 }),
      "https://example.com/llms-full.txt": okResponse("# Full Content\n\nlots of text\n"),
    });
    const result = await fetchLlmsTxt(fetcher, { url: "example.com" });
    const sc = result.structuredContent as {
      files: Array<{ file: string; present: boolean; valid?: boolean; sections?: unknown }>;
    };
    const full = sc.files.find((f) => f.file === "llms-full.txt");
    expect(full?.present).toBe(true);
    expect(full?.valid).toBe(true);
    expect(full?.sections).toBeUndefined();
  });

  it("surfaces an HTML error page served as llms.txt", async () => {
    const fetcher = stubFetcher({
      "https://example.com/llms.txt": okResponse("<!DOCTYPE html><html>404</html>"),
      "https://example.com/llms-full.txt": okResponse("x", { status: 404 }),
    });
    const result = await fetchLlmsTxt(fetcher, { url: "example.com" });
    const sc = result.structuredContent as { files: Array<{ file: string; valid?: boolean }> };
    expect(sc.files.find((f) => f.file === "llms.txt")?.valid).toBe(false);
  });

  it("reports an oversized file as present instead of erroring", async () => {
    const fetcher = stubFetcher({
      "https://example.com/llms.txt": okResponse("x", { status: 404 }),
      "https://example.com/llms-full.txt": {
        ok: false,
        error: { kind: "too_large", message: "Response exceeded the 2 MB size limit" },
      },
    });
    const result = await fetchLlmsTxt(fetcher, { url: "example.com" });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      files: Array<{ file: string; present: boolean; oversized?: boolean }>;
    };
    const full = sc.files.find((f) => f.file === "llms-full.txt");
    expect(full?.present).toBe(true);
    expect(full?.oversized).toBe(true);
    expect(result.content[0].text).toContain("2 MB");
  });

  it("returns isError when the origin is unreachable", async () => {
    const result = await fetchLlmsTxt(stubFetcher({}), { url: "unreachable.example" });
    expect(result.isError).toBe(true);
  });
});
