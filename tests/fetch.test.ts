import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpFetch, isHtmlContentType } from "../src/fetch.js";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
    } else if (req.url === "/redirect-once") {
      res.writeHead(302, { location: "/ok" });
      res.end();
    } else if (req.url === "/redirect-loop") {
      res.writeHead(302, { location: "/redirect-loop" });
      res.end();
    } else if (req.url === "/big") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("x".repeat(3_000_000));
    } else if (req.url === "/slow") {
      // never responds; connection stays open until the client aborts
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("httpFetch", () => {
  it("returns body and status for a plain 200", async () => {
    const r = await httpFetch(`${base}/ok`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe(200);
      expect(r.body).toBe("hello");
    }
  });

  it("returns non-2xx statuses as ok results (callers interpret them)", async () => {
    const r = await httpFetch(`${base}/nope`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe(404);
  });

  it("follows redirects and reports the final URL", async () => {
    const r = await httpFetch(`${base}/redirect-once`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body).toBe("hello");
      expect(r.finalUrl).toBe(`${base}/ok`);
    }
  });

  it("gives up after maxRedirects", async () => {
    const r = await httpFetch(`${base}/redirect-loop`, { maxRedirects: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("http_error");
  });

  it("rejects bodies over the size cap", async () => {
    const r = await httpFetch(`${base}/big`, { maxBytes: 1_000_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("too_large");
  });

  it("times out", async () => {
    const r = await httpFetch(`${base}/slow`, { timeoutMs: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("timeout");
  }, 10_000);

  it("classifies DNS failures", async () => {
    const r = await httpFetch("https://this-host-does-not-exist.invalid/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["dns", "http_error"]).toContain(r.error.kind);
  }, 15_000);
});

describe("isHtmlContentType", () => {
  it("accepts html, xhtml, and missing content types", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/xhtml+xml")).toBe(true);
    expect(isHtmlContentType(null)).toBe(true);
  });

  it("rejects clearly non-HTML types", () => {
    expect(isHtmlContentType("image/png")).toBe(false);
    expect(isHtmlContentType("application/pdf")).toBe(false);
  });
});
