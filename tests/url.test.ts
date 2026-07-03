import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/url.js";

describe("normalizeUrl", () => {
  it("accepts a full https URL", () => {
    const r = normalizeUrl("https://example.com/page");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.origin).toBe("https://example.com");
  });

  it("prepends https:// when the scheme is missing", () => {
    const r = normalizeUrl("example.com/blog");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.protocol).toBe("https:");
      expect(r.url.pathname).toBe("/blog");
    }
  });

  it("keeps http when given explicitly", () => {
    const r = normalizeUrl("http://example.com");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.protocol).toBe("http:");
  });

  it("rejects non-http(s) schemes", () => {
    const r = normalizeUrl("ftp://example.com");
    expect(r.ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(normalizeUrl("   ").ok).toBe(false);
  });

  it("rejects garbage that is not a URL", () => {
    expect(normalizeUrl("ht tp://???").ok).toBe(false);
  });
});
