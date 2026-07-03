# geo-inspector-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify geo-inspector-mcp, a TypeScript MCP server with four tools that inspect a website's AI-search readiness (robots.txt AI crawler access, llms.txt, JSON-LD schema markup, meta indexing directives).

**Architecture:** Three layers with strictly downward dependencies: server wiring (`src/index.ts`, `src/server.ts`), tools (`src/tools/*`, orchestrate fetch + parse + report, fetch injected for testability), and pure parsers (`src/parsers/*`, string in, typed result out, no network). One fetch helper (`src/fetch.ts`) owns all HTTP.

**Tech Stack:** TypeScript (strict, ESM, Node >= 20), `@modelcontextprotocol/sdk` (stdio transport), `zod` v3 (input schemas), `node-html-parser` (HTML), `vitest` (tests), `tsup` (build).

**Spec:** `docs/superpowers/specs/2026-07-02-geo-inspector-mcp-design.md`. The spec is authoritative on tool contracts; this plan is authoritative on code structure.

**Working directory:** `C:\Users\Nick\geo-inspector-mcp` (repo already exists with the spec committed). All paths below are relative to it. Never `git push`; commit locally only.

**Style rule:** No em dashes in any prose this project produces (README, descriptions, comments). Use commas, colons, or pipes.

---

## File structure (final state)

```
src/
  index.ts               entry point, shebang, connects stdio
  server.ts              buildServer(fetcher): registers the 4 tools
  fetch.ts               httpFetch + FetchResult types + isHtmlContentType
  url.ts                 normalizeUrl
  crawlers.ts            AI_CRAWLERS registry
  tools/
    shared.ts            ToolOutput, textResult, errorResult
    robots.ts            checkRobotsTxt
    llms-txt.ts          fetchLlmsTxt
    schema-markup.ts     detectSchemaMarkup
    meta-directives.ts   checkMetaDirectives
  parsers/
    robots.ts            parseRobots, evaluateAccess
    llms-txt.ts          parseLlmsTxt, looksLikeHtml
    json-ld.ts           extractJsonLd
    meta-robots.ts       parseMetaDirectives
tests/
  helpers.ts             stubFetcher, okResponse
  fixtures/
    robots-publisher.txt
    article-page.html
  url.test.ts  crawlers.test.ts  fetch.test.ts
  robots-parser.test.ts  robots-tool.test.ts
  llms-parser.test.ts    llms-tool.test.ts
  json-ld-parser.test.ts schema-tool.test.ts
  meta-parser.test.ts    meta-tool.test.ts
  server.test.ts
README.md  LICENSE  package.json  tsconfig.json  .gitignore
```

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "geo-inspector-mcp",
  "version": "0.1.0",
  "description": "MCP server that inspects a website's AI-search readiness: AI crawler access, llms.txt, schema markup, and indexing directives",
  "type": "module",
  "bin": {
    "geo-inspector-mcp": "dist/index.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --target node20 --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "seo",
    "geo",
    "ai-search",
    "generative-engine-optimization",
    "robots-txt",
    "llms-txt",
    "schema-org"
  ],
  "license": "MIT"
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
npm install @modelcontextprotocol/sdk zod@^3 node-html-parser
npm install -D typescript tsup vitest @types/node
```
Expected: both commands exit 0, `package-lock.json` created.

- [ ] **Step 5: Sanity check the toolchain**

Create `src/index.ts` containing only:
```ts
#!/usr/bin/env node
console.error("geo-inspector-mcp placeholder");
```
Run: `npx tsc --noEmit` (expected: no errors) and `npx vitest run` (expected: "No test files found" exits, that is fine at this stage; if vitest exits non-zero on empty, add `--passWithNoTests`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold TypeScript MCP server project"
```

---

### Task 2: URL normalization (`src/url.ts`)

**Files:**
- Create: `src/url.ts`
- Test: `tests/url.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/url.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/url.test.ts`
Expected: FAIL, cannot find module `../src/url.js`.

- [ ] **Step 3: Implement `src/url.ts`**

```ts
export type UrlResult = { ok: true; url: URL } | { ok: false; message: string };

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function normalizeUrl(input: string): UrlResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, message: "URL is empty" };
  }
  const withScheme = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, message: `Not a valid URL: ${input}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      message: `Only http and https URLs are supported, got ${url.protocol.replace(":", "")}`,
    };
  }
  return { ok: true, url };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/url.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/url.ts tests/url.test.ts
git commit -m "feat: URL normalization with scheme defaulting and http(s) enforcement"
```

---

### Task 3: AI crawler registry (`src/crawlers.ts`)

**Files:**
- Create: `src/crawlers.ts`
- Test: `tests/crawlers.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/crawlers.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawlers.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/crawlers.ts`**

```ts
export interface AiCrawler {
  name: string;
  vendor: string;
  purpose: "training" | "search" | "user_fetch";
}

// Names as they appear in robots.txt User-agent lines, per each vendor's public docs.
export const AI_CRAWLERS: AiCrawler[] = [
  { name: "GPTBot", vendor: "OpenAI", purpose: "training" },
  { name: "OAI-SearchBot", vendor: "OpenAI", purpose: "search" },
  { name: "ChatGPT-User", vendor: "OpenAI", purpose: "user_fetch" },
  { name: "ClaudeBot", vendor: "Anthropic", purpose: "training" },
  { name: "Claude-SearchBot", vendor: "Anthropic", purpose: "search" },
  { name: "Claude-User", vendor: "Anthropic", purpose: "user_fetch" },
  { name: "anthropic-ai", vendor: "Anthropic", purpose: "training" },
  { name: "PerplexityBot", vendor: "Perplexity", purpose: "search" },
  { name: "Perplexity-User", vendor: "Perplexity", purpose: "user_fetch" },
  { name: "Google-Extended", vendor: "Google", purpose: "training" },
  { name: "CCBot", vendor: "Common Crawl", purpose: "training" },
  { name: "Bytespider", vendor: "ByteDance", purpose: "training" },
  { name: "Applebot-Extended", vendor: "Apple", purpose: "training" },
  { name: "meta-externalagent", vendor: "Meta", purpose: "training" },
  { name: "cohere-ai", vendor: "Cohere", purpose: "training" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawlers.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/crawlers.ts tests/crawlers.test.ts
git commit -m "feat: AI crawler registry"
```

---

### Task 4: Fetch helper (`src/fetch.ts`)

**Files:**
- Create: `src/fetch.ts`
- Test: `tests/fetch.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/fetch.test.ts` (uses an in-process `node:http` server, no external network):
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/fetch.test.ts`
Expected: FAIL, cannot find module `../src/fetch.js`.

- [ ] **Step 3: Implement `src/fetch.ts`**

```ts
export type FetchErrorKind =
  | "invalid_url"
  | "dns"
  | "timeout"
  | "http_error"
  | "too_large"
  | "not_text";

export interface FetchError {
  kind: FetchErrorKind;
  message: string;
}

export type FetchResult =
  | { ok: true; status: number; headers: Headers; body: string; finalUrl: string }
  | { ok: false; error: FetchError };

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResult>;

const USER_AGENT = "geo-inspector-mcp/0.1.0";

export const httpFetch: Fetcher = async (url, options = {}) => {
  const { timeoutMs = 10_000, maxBytes = 2_000_000, maxRedirects = 5 } = options;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html, text/plain, application/json, */*",
        },
      });
    } catch (err) {
      return { ok: false, error: classifyNetworkError(err, current, timeoutMs) };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (location === null) {
        return { ok: true, status: response.status, headers: response.headers, body: "", finalUrl: current };
      }
      current = new URL(location, current).toString();
      continue;
    }
    const read = await readCapped(response, maxBytes);
    if (!read.ok) return read;
    return { ok: true, status: response.status, headers: response.headers, body: read.body, finalUrl: current };
  }
  return {
    ok: false,
    error: { kind: "http_error", message: `Gave up after ${maxRedirects} redirects fetching ${url}` },
  };
};

export function isHtmlContentType(contentType: string | null): boolean {
  if (contentType === null || contentType.trim() === "") return true;
  const ct = contentType.toLowerCase();
  return ct.includes("html") || ct.includes("xml");
}

function classifyNetworkError(err: unknown, url: string, timeoutMs: number): FetchError {
  const name = err instanceof Error ? err.name : "";
  const code = (err as { cause?: { code?: string } } | null)?.cause?.code ?? "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { kind: "timeout", message: `Request timed out after ${timeoutMs / 1000}s: ${url}` };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { kind: "dns", message: `Could not resolve host: ${url}` };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "http_error", message: `Request failed for ${url}: ${message}` };
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; body: string } | { ok: false; error: FetchError }> {
  const reader = response.body?.getReader();
  if (reader === undefined) return { ok: true, body: "" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return {
        ok: false,
        error: {
          kind: "too_large",
          message: `Response exceeded the ${Math.round(maxBytes / 1_000_000)} MB size limit`,
        },
      };
    }
    chunks.push(value);
  }
  return { ok: true, body: Buffer.concat(chunks).toString("utf8") };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/fetch.test.ts`
Expected: 9 passed. (The DNS test tolerates `http_error` because some resolvers wrap the failure differently.)

- [ ] **Step 5: Commit**

```bash
git add src/fetch.ts tests/fetch.test.ts
git commit -m "feat: capped, redirect-limited fetch helper with error taxonomy"
```

---

### Task 5: Test helpers for tool tests

**Files:**
- Create: `tests/helpers.ts`

- [ ] **Step 1: Write `tests/helpers.ts`** (no test for the helper itself; it is exercised by every tool test)

```ts
import type { Fetcher, FetchResult } from "../src/fetch.js";

export function stubFetcher(routes: Record<string, FetchResult>): Fetcher {
  return async (url) =>
    routes[url] ?? {
      ok: false,
      error: { kind: "dns", message: `no stub registered for ${url}` },
    };
}

export function okResponse(
  body: string,
  init?: { status?: number; headers?: Record<string, string>; finalUrl?: string },
): FetchResult {
  return {
    ok: true,
    status: init?.status ?? 200,
    headers: new Headers(init?.headers ?? {}),
    body,
    finalUrl: init?.finalUrl ?? "stub://final",
  };
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` (expected: clean).
```bash
git add tests/helpers.ts
git commit -m "test: stub fetcher helpers for tool tests"
```

---

### Task 6: robots.txt parser (`src/parsers/robots.ts`)

**Files:**
- Create: `src/parsers/robots.ts`, `tests/fixtures/robots-publisher.txt`
- Test: `tests/robots-parser.test.ts`

- [ ] **Step 1: Write the fixture** `tests/fixtures/robots-publisher.txt`

```
# Publisher-style robots.txt modeled on common news-site patterns
User-agent: *
Disallow: /search
Allow: /search/about
Disallow: /admin/

User-agent: GPTBot
User-agent: CCBot
User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: PerplexityBot
Disallow: /

Sitemap: https://example-publisher.com/sitemap.xml
Sitemap: https://example-publisher.com/news-sitemap.xml
```

- [ ] **Step 2: Write the failing tests**

`tests/robots-parser.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateAccess, parseRobots } from "../src/parsers/robots.js";

const publisher = readFileSync(new URL("./fixtures/robots-publisher.txt", import.meta.url), "utf8");

describe("parseRobots", () => {
  it("parses groups, shared user-agent lines, and sitemaps", () => {
    const parsed = parseRobots(publisher);
    expect(parsed.groups.length).toBe(4);
    expect(parsed.groups[1].agents).toEqual(["gptbot", "ccbot", "anthropic-ai"]);
    expect(parsed.sitemaps).toEqual([
      "https://example-publisher.com/sitemap.xml",
      "https://example-publisher.com/news-sitemap.xml",
    ]);
  });

  it("strips comments, tolerates BOM and CRLF, ignores unknown directives", () => {
    const bom = String.fromCharCode(0xfeff);
    const parsed = parseRobots(bom + "User-agent: *\r\nCrawl-delay: 5\r\nDisallow: /x # inline comment\r\n");
    expect(parsed.groups.length).toBe(1);
    expect(parsed.groups[0].rules).toEqual([{ type: "disallow", path: "/x" }]);
  });

  it("returns no groups for an empty file", () => {
    expect(parseRobots("").groups).toEqual([]);
  });
});

describe("evaluateAccess", () => {
  const parsed = parseRobots(publisher);

  it("blocks agents with a dedicated Disallow: / group", () => {
    const r = evaluateAccess(parsed, "GPTBot", "/");
    expect(r.access).toBe("blocked");
    expect(r.matchedGroup).toBe("GPTBot");
    expect(r.matchedRule).toBe("Disallow: /");
  });

  it("matches agent names case-insensitively", () => {
    expect(evaluateAccess(parsed, "gptbot", "/").access).toBe("blocked");
  });

  it("falls back to the * group for unlisted agents", () => {
    const r = evaluateAccess(parsed, "ClaudeBot", "/some-article");
    expect(r.access).toBe("allowed");
    expect(r.matchedGroup).toBe("*");
  });

  it("applies longest-match precedence (Allow beats shorter Disallow)", () => {
    const r = evaluateAccess(parsed, "SomeBot", "/search/about");
    expect(r.access).toBe("allowed");
    expect(r.matchedRule).toBe("Allow: /search/about");
  });

  it("blocks on the shorter Disallow when the Allow does not match", () => {
    expect(evaluateAccess(parsed, "SomeBot", "/search?q=x").access).toBe("blocked");
  });

  it("allows everything when no group matches at all", () => {
    const none = parseRobots("User-agent: OnlyBot\nDisallow: /\n");
    const r = evaluateAccess(none, "OtherBot", "/");
    expect(r.access).toBe("allowed");
    expect(r.matchedGroup).toBeNull();
  });

  it("treats an empty Disallow as allow-all", () => {
    const p = parseRobots("User-agent: *\nDisallow:\n");
    expect(evaluateAccess(p, "AnyBot", "/anything").access).toBe("allowed");
  });

  it("supports * wildcards in paths", () => {
    const p = parseRobots("User-agent: *\nDisallow: /private*/data\n");
    expect(evaluateAccess(p, "AnyBot", "/private-stuff/data").access).toBe("blocked");
    expect(evaluateAccess(p, "AnyBot", "/private-stuff/other").access).toBe("allowed");
  });

  it("supports $ end anchors", () => {
    const p = parseRobots("User-agent: *\nDisallow: /*.pdf$\n");
    expect(evaluateAccess(p, "AnyBot", "/file.pdf").access).toBe("blocked");
    expect(evaluateAccess(p, "AnyBot", "/file.pdf.html").access).toBe("allowed");
  });

  it("prefers Allow on an exact-length tie", () => {
    const p = parseRobots("User-agent: *\nDisallow: /page\nAllow: /page\n");
    expect(evaluateAccess(p, "AnyBot", "/page").access).toBe("allowed");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/robots-parser.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 4: Implement `src/parsers/robots.ts`**

```ts
export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface AccessResult {
  access: "allowed" | "blocked";
  matchedGroup: string | null;
  matchedRule: string | null;
}

export function parseRobots(content: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let currentGroup: RobotsGroup | null = null;
  let lastLineWasUserAgent = false;

  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = withoutBom.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!lastLineWasUserAgent || currentGroup === null) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
      }
      if (value !== "") currentGroup.agents.push(value.toLowerCase());
      lastLineWasUserAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastLineWasUserAgent = false;
      if (currentGroup !== null) currentGroup.rules.push({ type: key, path: value });
    } else {
      lastLineWasUserAgent = false;
      if (key === "sitemap" && value !== "") sitemaps.push(value);
    }
  }
  return { groups, sitemaps };
}

export function evaluateAccess(robots: ParsedRobots, agent: string, path: string): AccessResult {
  const wanted = agent.toLowerCase();
  let group = robots.groups.find((g) => g.agents.includes(wanted));
  let matchedGroup: string | null = group !== undefined ? agent : null;
  if (group === undefined) {
    group = robots.groups.find((g) => g.agents.includes("*"));
    matchedGroup = group !== undefined ? "*" : null;
  }
  if (group === undefined) {
    return { access: "allowed", matchedGroup: null, matchedRule: null };
  }

  let best: { rule: RobotsRule; specificity: number } | null = null;
  for (const rule of group.rules) {
    if (rule.path === "") continue; // an empty Disallow matches nothing (allows everything)
    if (!pathMatches(rule.path, path)) continue;
    const specificity = rule.path.length;
    if (
      best === null ||
      specificity > best.specificity ||
      (specificity === best.specificity && rule.type === "allow" && best.rule.type === "disallow")
    ) {
      best = { rule, specificity };
    }
  }
  if (best === null) {
    return { access: "allowed", matchedGroup, matchedRule: null };
  }
  return {
    access: best.rule.type === "allow" ? "allowed" : "blocked",
    matchedGroup,
    matchedRule: `${best.rule.type === "allow" ? "Allow" : "Disallow"}: ${best.rule.path}`,
  };
}

function pathMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = core.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/robots-parser.test.ts`
Expected: 13 passed.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/robots.ts tests/robots-parser.test.ts tests/fixtures/robots-publisher.txt
git commit -m "feat: RFC 9309 robots.txt parser with per-agent access evaluation"
```

---

### Task 7: Shared tool result types (`src/tools/shared.ts`)

**Files:**
- Create: `src/tools/shared.ts`

- [ ] **Step 1: Write `src/tools/shared.ts`** (types only; exercised by every tool test)

```ts
export interface ToolOutput {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function textResult(text: string, structuredContent?: Record<string, unknown>): ToolOutput {
  return { content: [{ type: "text", text }], structuredContent };
}

export function errorResult(message: string): ToolOutput {
  return { content: [{ type: "text", text: message }], isError: true };
}
```

The index signature keeps `ToolOutput` assignable to the SDK's `CallToolResult`.

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` (expected: clean).
```bash
git add src/tools/shared.ts
git commit -m "feat: shared MCP tool result helpers"
```

---

### Task 8: check_robots_txt tool (`src/tools/robots.ts`)

**Files:**
- Create: `src/tools/robots.ts`
- Test: `tests/robots-tool.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/robots-tool.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/robots-tool.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/tools/robots.ts`**

```ts
import { AI_CRAWLERS } from "../crawlers.js";
import type { Fetcher } from "../fetch.js";
import { evaluateAccess, parseRobots } from "../parsers/robots.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

interface CrawlerReport {
  name: string;
  vendor: string;
  purpose: string;
  access: "allowed" | "blocked";
  matchedGroup: string | null;
  matchedRule: string | null;
}

export async function checkRobotsTxt(
  fetcher: Fetcher,
  input: { url: string; path?: string },
): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const checkPath = input.path ?? "/";
  const robotsUrl = `${normalized.url.origin}/robots.txt`;

  const res = await fetcher(robotsUrl);
  if (!res.ok) {
    return errorResult(`Could not fetch robots.txt at ${robotsUrl}: ${res.error.message}`);
  }

  const uniform = (access: "allowed" | "blocked"): CrawlerReport[] =>
    AI_CRAWLERS.map((c) => ({
      name: c.name,
      vendor: c.vendor,
      purpose: c.purpose,
      access,
      matchedGroup: null,
      matchedRule: null,
    }));

  if (res.status >= 500) {
    return textResult(
      `robots.txt at ${robotsUrl} returned HTTP ${res.status}. RFC 9309 says an unreachable robots.txt must be treated as complete disallow, so assume every crawler is blocked until the server recovers.`,
      {
        robotsUrl,
        fetched: false,
        status: res.status,
        path: checkPath,
        sitemaps: [],
        groupCount: 0,
        crawlers: uniform("blocked"),
      },
    );
  }

  if (res.status >= 400) {
    return textResult(
      `No robots.txt found at ${robotsUrl} (HTTP ${res.status}). Per RFC 9309 that means no crawling restrictions: all ${AI_CRAWLERS.length} known AI crawlers are allowed.`,
      {
        robotsUrl,
        fetched: false,
        status: res.status,
        path: checkPath,
        sitemaps: [],
        groupCount: 0,
        crawlers: uniform("allowed"),
      },
    );
  }

  const parsed = parseRobots(res.body);
  const crawlers: CrawlerReport[] = AI_CRAWLERS.map((c) => {
    const access = evaluateAccess(parsed, c.name, checkPath);
    return { name: c.name, vendor: c.vendor, purpose: c.purpose, ...access };
  });

  const blocked = crawlers.filter((c) => c.access === "blocked");
  const allowed = crawlers.filter((c) => c.access === "allowed");
  const lines = [
    `robots.txt for ${normalized.url.origin} (path checked: ${checkPath})`,
    `Blocked AI crawlers (${blocked.length}/${crawlers.length}): ${blocked.map((c) => `${c.name} [${c.vendor}]`).join(", ") || "none"}`,
    `Allowed AI crawlers (${allowed.length}/${crawlers.length}): ${allowed.map((c) => c.name).join(", ") || "none"}`,
  ];
  if (parsed.sitemaps.length > 0) lines.push(`Sitemaps: ${parsed.sitemaps.join(", ")}`);

  return textResult(lines.join("\n"), {
    robotsUrl,
    fetched: true,
    status: res.status,
    path: checkPath,
    sitemaps: parsed.sitemaps,
    groupCount: parsed.groups.length,
    crawlers,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/robots-tool.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/robots.ts tests/robots-tool.test.ts
git commit -m "feat: check_robots_txt tool with RFC 9309 status semantics"
```

---

### Task 9: llms.txt parser (`src/parsers/llms-txt.ts`)

**Files:**
- Create: `src/parsers/llms-txt.ts`
- Test: `tests/llms-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/llms-parser.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/llms-parser.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/parsers/llms-txt.ts`**

```ts
export interface LlmsTxtSection {
  name: string;
  linkCount: number;
}

export interface LlmsTxtValidation {
  valid: boolean;
  title: string | null;
  hasSummary: boolean;
  sections: LlmsTxtSection[];
  warnings: string[];
}

const LINK_LINE = /^\s*[-*]\s*\[[^\]]+\]\([^)]+\)/;

export function looksLikeHtml(content: string): boolean {
  const head = content.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml");
}

export function parseLlmsTxt(content: string): LlmsTxtValidation {
  const warnings: string[] = [];
  if (looksLikeHtml(content)) {
    return {
      valid: false,
      title: null,
      hasSummary: false,
      sections: [],
      warnings: [
        "Response looks like an HTML page. The server is probably returning an error page instead of a plain-text llms.txt.",
      ],
    };
  }

  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = withoutBom.split(/\r?\n/);

  let title: string | null = null;
  let titleLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+)$/);
    if (m !== null) {
      title = m[1].trim();
      titleLine = i;
      break;
    }
  }

  if (title === null) {
    warnings.push("Missing H1 title. The llms.txt spec requires the file to start with `# Site Name`.");
  } else if (lines.slice(0, titleLine).some((l) => l.trim() !== "")) {
    warnings.push("Content appears before the H1 title.");
  }

  let hasSummary = false;
  if (titleLine !== -1) {
    for (let i = titleLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      hasSummary = line.startsWith(">");
      break;
    }
  }

  const sections: LlmsTxtSection[] = [];
  let current: LlmsTxtSection | null = null;
  for (let i = titleLine + 1; i < lines.length; i++) {
    const h2 = lines[i].match(/^##\s+(.+)$/);
    if (h2 !== null) {
      current = { name: h2[1].trim(), linkCount: 0 };
      sections.push(current);
    } else if (current !== null && LINK_LINE.test(lines[i])) {
      current.linkCount++;
    }
  }
  for (const section of sections) {
    if (section.linkCount === 0) {
      warnings.push(`Section "${section.name}" contains no links.`);
    }
  }

  return { valid: title !== null, title, hasSummary, sections, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llms-parser.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/llms-txt.ts tests/llms-parser.test.ts
git commit -m "feat: llms.txt structural validator"
```

---

### Task 10: fetch_llms_txt tool (`src/tools/llms-txt.ts`)

**Files:**
- Create: `src/tools/llms-txt.ts`
- Test: `tests/llms-tool.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/llms-tool.test.ts`:
```ts
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

  it("returns isError when the origin is unreachable", async () => {
    const result = await fetchLlmsTxt(stubFetcher({}), { url: "unreachable.example" });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/llms-tool.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/tools/llms-txt.ts`**

```ts
import type { Fetcher } from "../fetch.js";
import { looksLikeHtml, parseLlmsTxt } from "../parsers/llms-txt.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

export async function fetchLlmsTxt(fetcher: Fetcher, input: { url: string }): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const origin = normalized.url.origin;

  const files: Record<string, unknown>[] = [];
  const summaryLines: string[] = [];

  for (const file of ["llms.txt", "llms-full.txt"] as const) {
    const url = `${origin}/${file}`;
    const res = await fetcher(url);
    if (!res.ok) {
      return errorResult(`Could not fetch ${url}: ${res.error.message}`);
    }
    if (res.status !== 200) {
      files.push({ file, url, present: false, status: res.status });
      summaryLines.push(`${file}: not found (HTTP ${res.status})`);
      continue;
    }
    const bytes = Buffer.byteLength(res.body, "utf8");
    if (file === "llms.txt") {
      const v = parseLlmsTxt(res.body);
      files.push({
        file,
        url,
        present: true,
        status: res.status,
        bytes,
        valid: v.valid,
        title: v.title,
        hasSummary: v.hasSummary,
        sections: v.sections,
        warnings: v.warnings,
      });
      const state = v.valid ? "valid" : "invalid";
      const warn = v.warnings.length > 0 ? ` (${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"})` : "";
      summaryLines.push(`${file}: present, ${state}${warn}, title: ${v.title ?? "none"}, ${v.sections.length} section(s)`);
    } else {
      // llms-full.txt is expanded content by design: check presence, size, and H1 only.
      const html = looksLikeHtml(res.body);
      const title = parseLlmsTxt(res.body).title;
      const warnings: string[] = [];
      if (html) warnings.push("Response looks like an HTML page instead of plain text.");
      else if (title === null) warnings.push("Missing H1 title.");
      files.push({ file, url, present: true, status: res.status, bytes, valid: title !== null, title, warnings });
      summaryLines.push(`${file}: present (${bytes} bytes)`);
    }
  }

  const anyPresent = files.some((f) => f["present"] === true);
  const header = anyPresent
    ? `llms.txt check for ${origin}`
    : `No llms.txt or llms-full.txt found at ${origin}. The site has not adopted the llms.txt standard.`;

  return textResult([header, ...summaryLines].join("\n"), { files });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llms-tool.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/llms-txt.ts tests/llms-tool.test.ts
git commit -m "feat: fetch_llms_txt tool with full and light validation modes"
```

---

### Task 11: JSON-LD parser (`src/parsers/json-ld.ts`)

**Files:**
- Create: `src/parsers/json-ld.ts`, `tests/fixtures/article-page.html`
- Test: `tests/json-ld-parser.test.ts`

- [ ] **Step 1: Write the fixture** `tests/fixtures/article-page.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Sample Article</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "name": "Example News",
        "sameAs": ["https://twitter.com/example", "https://en.wikipedia.org/wiki/Example"]
      },
      {
        "@type": "WebSite",
        "name": "Example News Site"
      }
    ]
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": ["NewsArticle"],
    "headline": "Something happened",
    "name": "Something happened"
  }
  </script>
  <script type="application/ld+json">
  { this is broken json
  </script>
</head>
<body><p>Article body.</p></body>
</html>
```

- [ ] **Step 2: Write the failing tests**

`tests/json-ld-parser.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/json-ld-parser.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 4: Implement `src/parsers/json-ld.ts`**

```ts
import { parse } from "node-html-parser";

export interface JsonLdEntity {
  types: string[];
  name: string | null;
  hasSameAs: boolean;
}

export interface JsonLdResult {
  blockCount: number;
  parseErrors: number;
  errors: string[];
  typeCounts: Record<string, number>;
  entities: JsonLdEntity[];
}

export function extractJsonLd(html: string): JsonLdResult {
  const root = parse(html);
  const scripts = root
    .querySelectorAll("script")
    .filter((s) => (s.getAttribute("type") ?? "").toLowerCase().trim() === "application/ld+json");

  const result: JsonLdResult = {
    blockCount: scripts.length,
    parseErrors: 0,
    errors: [],
    typeCounts: {},
    entities: [],
  };

  for (const script of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(script.text);
    } catch (err) {
      result.parseErrors++;
      result.errors.push(err instanceof Error ? err.message : String(err));
      continue;
    }
    for (const node of flattenNodes(data)) {
      recordNode(node, result);
    }
  }
  return result;
}

function flattenNodes(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.flatMap(flattenNodes);
  if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const nodes: Record<string, unknown>[] = [obj];
    if (Array.isArray(obj["@graph"])) {
      nodes.push(...(obj["@graph"] as unknown[]).flatMap(flattenNodes));
    }
    return nodes;
  }
  return [];
}

function recordNode(node: Record<string, unknown>, result: JsonLdResult): void {
  const rawType = node["@type"];
  const types = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  if (types.length === 0) return;
  for (const t of types) {
    result.typeCounts[t] = (result.typeCounts[t] ?? 0) + 1;
  }
  const sameAs = node["sameAs"];
  result.entities.push({
    types,
    name: typeof node["name"] === "string" ? node["name"] : null,
    hasSameAs: Array.isArray(sameAs) ? sameAs.length > 0 : typeof sameAs === "string",
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/json-ld-parser.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/json-ld.ts tests/json-ld-parser.test.ts tests/fixtures/article-page.html
git commit -m "feat: JSON-LD extractor with @graph flattening and sameAs detection"
```

---

### Task 12: detect_schema_markup tool (`src/tools/schema-markup.ts`)

**Files:**
- Create: `src/tools/schema-markup.ts`
- Test: `tests/schema-tool.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/schema-tool.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/schema-tool.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/tools/schema-markup.ts`**

```ts
import type { Fetcher } from "../fetch.js";
import { isHtmlContentType } from "../fetch.js";
import { extractJsonLd } from "../parsers/json-ld.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

const AI_RELEVANT = ["Organization", "WebSite", "Article", "FAQPage", "BreadcrumbList", "Person"] as const;
const ARTICLE_TYPES = ["Article", "NewsArticle", "BlogPosting"];

export async function detectSchemaMarkup(fetcher: Fetcher, input: { url: string }): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const pageUrl = normalized.url.toString();

  const res = await fetcher(pageUrl);
  if (!res.ok) return errorResult(`Could not fetch ${pageUrl}: ${res.error.message}`);
  if (res.status >= 400) return errorResult(`Fetching ${pageUrl} returned HTTP ${res.status}.`);
  if (!isHtmlContentType(res.headers.get("content-type"))) {
    return errorResult(
      `The response from ${pageUrl} is ${res.headers.get("content-type") ?? "unknown"}, not HTML, so it cannot contain schema markup.`,
    );
  }

  const extracted = extractJsonLd(res.body);

  const aiRelevant: Record<string, boolean> = {};
  for (const key of AI_RELEVANT) {
    aiRelevant[key] =
      key === "Article"
        ? ARTICLE_TYPES.some((t) => (extracted.typeCounts[t] ?? 0) > 0)
        : (extracted.typeCounts[key] ?? 0) > 0;
  }

  const found = Object.entries(extracted.typeCounts)
    .map(([type, count]) => (count > 1 ? `${type} x${count}` : type))
    .join(", ");
  const missing = AI_RELEVANT.filter((k) => !aiRelevant[k]).join(", ");
  const lines: string[] = [];
  if (extracted.blockCount === 0) {
    lines.push(`No JSON-LD structured data found on ${pageUrl}.`);
  } else {
    lines.push(`JSON-LD on ${pageUrl}: ${extracted.blockCount} block(s), types: ${found === "" ? "none with @type" : found}`);
  }
  if (extracted.parseErrors > 0) {
    lines.push(`${extracted.parseErrors} block(s) failed to parse as JSON.`);
  }
  if (missing !== "") {
    lines.push(`AI-relevant types not found: ${missing}`);
  }
  const disambiguated = extracted.entities.filter(
    (e) => e.hasSameAs && e.types.some((t) => t === "Organization" || t === "Person"),
  );
  if (disambiguated.length > 0) {
    lines.push(`Entities with sameAs disambiguation: ${disambiguated.map((e) => e.name ?? e.types[0]).join(", ")}`);
  }

  return textResult(lines.join("\n"), {
    pageUrl,
    blockCount: extracted.blockCount,
    parseErrors: extracted.parseErrors,
    typeCounts: extracted.typeCounts,
    aiRelevant,
    entities: extracted.entities,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/schema-tool.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/schema-markup.ts tests/schema-tool.test.ts
git commit -m "feat: detect_schema_markup tool with AI-relevant type checklist"
```

---

### Task 13: Meta directives parser (`src/parsers/meta-robots.ts`)

**Files:**
- Create: `src/parsers/meta-robots.ts`
- Test: `tests/meta-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/meta-parser.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/meta-parser.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/parsers/meta-robots.ts`**

```ts
import { parse } from "node-html-parser";
import { AI_CRAWLERS } from "../crawlers.js";

export interface MetaTagDirectives {
  name: string;
  directives: string[];
}

export interface XRobotsTagEntry {
  agent: string | null;
  directives: string[];
}

export interface MetaDirectivesSummary {
  indexable: boolean;
  followable: boolean;
  aiDirectives: string[];
}

export interface MetaDirectivesResult {
  metaTags: MetaTagDirectives[];
  xRobotsTag: XRobotsTagEntry[];
  summary: MetaDirectivesSummary;
}

const AI_AGENT_NAMES = new Set(AI_CRAWLERS.map((c) => c.name.toLowerCase()));
const GENERIC_BOT_NAMES = new Set(["robots", "googlebot", "bingbot"]);
const AI_CONTENT_DIRECTIVES = new Set(["noai", "noimageai"]);
const KNOWN_DIRECTIVES = new Set([
  "all",
  "noindex",
  "nofollow",
  "none",
  "noarchive",
  "nosnippet",
  "notranslate",
  "noimageindex",
  "indexifembedded",
  "noai",
  "noimageai",
]);

export function parseMetaDirectives(html: string, xRobotsHeaderValues: string[]): MetaDirectivesResult {
  const root = parse(html);
  const metaTags: MetaTagDirectives[] = [];

  for (const meta of root.querySelectorAll("meta")) {
    const name = (meta.getAttribute("name") ?? "").toLowerCase().trim();
    if (name === "") continue;
    if (GENERIC_BOT_NAMES.has(name) || AI_AGENT_NAMES.has(name)) {
      const content = (meta.getAttribute("content") ?? "").toLowerCase();
      const directives = content
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d !== "");
      if (directives.length > 0) metaTags.push({ name, directives });
    } else if (AI_CONTENT_DIRECTIVES.has(name)) {
      metaTags.push({ name, directives: [name] });
    }
  }

  const xRobotsTag = xRobotsHeaderValues.flatMap(parseXRobotsValue);

  const globalDirectives = new Set<string>();
  for (const tag of metaTags) {
    if (tag.name === "robots") for (const d of tag.directives) globalDirectives.add(d);
  }
  for (const entry of xRobotsTag) {
    if (entry.agent === null) for (const d of entry.directives) globalDirectives.add(d);
  }

  const aiDirectives = new Set<string>();
  for (const tag of metaTags) {
    for (const d of tag.directives) {
      if (AI_CONTENT_DIRECTIVES.has(d)) aiDirectives.add(d);
      if (AI_AGENT_NAMES.has(tag.name)) aiDirectives.add(`${tag.name}:${d}`);
    }
  }
  for (const entry of xRobotsTag) {
    for (const d of entry.directives) {
      if (AI_CONTENT_DIRECTIVES.has(d)) aiDirectives.add(d);
      if (entry.agent !== null && AI_AGENT_NAMES.has(entry.agent)) aiDirectives.add(`${entry.agent}:${d}`);
    }
  }

  return {
    metaTags,
    xRobotsTag,
    summary: {
      indexable: !globalDirectives.has("noindex") && !globalDirectives.has("none"),
      followable: !globalDirectives.has("nofollow") && !globalDirectives.has("none"),
      aiDirectives: [...aiDirectives].sort(),
    },
  };
}

function parseXRobotsValue(value: string): XRobotsTagEntry[] {
  const entries: XRobotsTagEntry[] = [];
  let current: XRobotsTagEntry | null = null;
  for (const rawToken of value.split(",")) {
    const token = rawToken.trim().toLowerCase();
    if (token === "") continue;
    const colon = token.indexOf(":");
    const prefix = colon === -1 ? "" : token.slice(0, colon).trim();
    const isAgentPrefix =
      colon !== -1 && !KNOWN_DIRECTIVES.has(prefix) && !prefix.startsWith("max-") && prefix !== "unavailable_after";
    if (isAgentPrefix) {
      const first = token.slice(colon + 1).trim();
      current = { agent: prefix, directives: first === "" ? [] : [first] };
      entries.push(current);
    } else if (current !== null) {
      current.directives.push(token);
    } else {
      current = { agent: null, directives: [token] };
      entries.push(current);
    }
  }
  return entries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/meta-parser.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/meta-robots.ts tests/meta-parser.test.ts
git commit -m "feat: meta robots and X-Robots-Tag directive parser"
```

---

### Task 14: check_meta_directives tool (`src/tools/meta-directives.ts`)

**Files:**
- Create: `src/tools/meta-directives.ts`
- Test: `tests/meta-tool.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/meta-tool.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { checkMetaDirectives } from "../src/tools/meta-directives.js";
import { okResponse, stubFetcher } from "./helpers.js";

describe("checkMetaDirectives", () => {
  it("combines meta tags and X-Robots-Tag headers into one report", async () => {
    const fetcher = stubFetcher({
      "https://example.com/": okResponse(`<meta name="robots" content="noindex"><meta name="GPTBot" content="noindex">`, {
        headers: { "content-type": "text/html", "x-robots-tag": "noai" },
      }),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/meta-tool.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/tools/meta-directives.ts`**

```ts
import type { Fetcher } from "../fetch.js";
import { isHtmlContentType } from "../fetch.js";
import { parseMetaDirectives } from "../parsers/meta-robots.js";
import { normalizeUrl } from "../url.js";
import { errorResult, textResult, type ToolOutput } from "./shared.js";

export async function checkMetaDirectives(fetcher: Fetcher, input: { url: string }): Promise<ToolOutput> {
  const normalized = normalizeUrl(input.url);
  if (!normalized.ok) return errorResult(normalized.message);
  const pageUrl = normalized.url.toString();

  const res = await fetcher(pageUrl);
  if (!res.ok) return errorResult(`Could not fetch ${pageUrl}: ${res.error.message}`);
  if (res.status >= 400) return errorResult(`Fetching ${pageUrl} returned HTTP ${res.status}.`);
  if (!isHtmlContentType(res.headers.get("content-type"))) {
    return errorResult(
      `The response from ${pageUrl} is ${res.headers.get("content-type") ?? "unknown"}, not HTML. Meta directive inspection needs an HTML page.`,
    );
  }

  const headerValue = res.headers.get("x-robots-tag");
  const parsed = parseMetaDirectives(res.body, headerValue === null ? [] : [headerValue]);

  const lines = [
    `Indexing directives for ${pageUrl}`,
    `Page is ${parsed.summary.indexable ? "indexable" : "NOT indexable"} and links are ${parsed.summary.followable ? "followable" : "NOT followable"}.`,
  ];
  if (parsed.metaTags.length > 0) {
    lines.push(`Meta tags: ${parsed.metaTags.map((t) => `${t.name}=[${t.directives.join(" ")}]`).join(", ")}`);
  }
  if (parsed.xRobotsTag.length > 0) {
    lines.push(
      `X-Robots-Tag: ${parsed.xRobotsTag.map((e) => `${e.agent ?? "(all agents)"}=[${e.directives.join(" ")}]`).join(", ")}`,
    );
  }
  lines.push(
    parsed.summary.aiDirectives.length > 0
      ? `AI-specific restrictions: ${parsed.summary.aiDirectives.join(", ")}`
      : "No AI-specific restrictions found.",
  );

  return textResult(lines.join("\n"), {
    pageUrl,
    status: res.status,
    metaTags: parsed.metaTags,
    xRobotsTag: parsed.xRobotsTag,
    summary: parsed.summary,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/meta-tool.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/meta-directives.ts tests/meta-tool.test.ts
git commit -m "feat: check_meta_directives tool combining meta tags and X-Robots-Tag"
```

---

### Task 15: Server wiring (`src/server.ts`, `src/index.ts`) and integration test

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts` (replace the placeholder)
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/server.test.ts`:
```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { okResponse, stubFetcher } from "./helpers.js";

async function connectedClient(fetcher = stubFetcher({})) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer(fetcher);
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

describe("geo-inspector-mcp server", () => {
  it("lists exactly the four tools", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_meta_directives",
      "check_robots_txt",
      "detect_schema_markup",
      "fetch_llms_txt",
    ]);
  });

  it("executes check_robots_txt end to end", async () => {
    const client = await connectedClient(
      stubFetcher({
        "https://example.com/robots.txt": okResponse("User-agent: GPTBot\nDisallow: /\n"),
      }),
    );
    const result = await client.callTool({ name: "check_robots_txt", arguments: { url: "example.com" } });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("GPTBot");
    const sc = result.structuredContent as { crawlers: Array<{ name: string; access: string }> };
    expect(sc.crawlers.find((c) => c.name === "GPTBot")?.access).toBe("blocked");
  });

  it("surfaces tool errors as isError results, not protocol errors", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "fetch_llms_txt", arguments: { url: "ftp://nope" } });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL, cannot find module `../src/server.js`.

- [ ] **Step 3: Implement `src/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { httpFetch, type Fetcher } from "./fetch.js";
import { checkMetaDirectives } from "./tools/meta-directives.js";
import { checkRobotsTxt } from "./tools/robots.js";
import { detectSchemaMarkup } from "./tools/schema-markup.js";
import { fetchLlmsTxt } from "./tools/llms-txt.js";

const URL_FIELD = z.string().min(1).describe("Website URL. Scheme is optional, example.com works.");

export function buildServer(fetcher: Fetcher = httpFetch): McpServer {
  const server = new McpServer({ name: "geo-inspector-mcp", version: "0.1.0" });

  server.registerTool(
    "check_robots_txt",
    {
      title: "Check AI crawler access in robots.txt",
      description:
        "Fetch and parse a site's robots.txt per RFC 9309, then report which AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and more) are allowed or blocked for a given path. Also lists sitemaps.",
      inputSchema: {
        url: URL_FIELD,
        path: z.string().optional().describe("Path to evaluate access for. Defaults to /"),
      },
    },
    async (args) => checkRobotsTxt(fetcher, args),
  );

  server.registerTool(
    "fetch_llms_txt",
    {
      title: "Fetch and validate llms.txt",
      description:
        "Check whether a site publishes /llms.txt and /llms-full.txt, and validate llms.txt structure against the llmstxt.org spec (H1 title, summary blockquote, H2 link sections).",
      inputSchema: { url: URL_FIELD },
    },
    async (args) => fetchLlmsTxt(fetcher, args),
  );

  server.registerTool(
    "detect_schema_markup",
    {
      title: "Detect JSON-LD schema markup",
      description:
        "Extract JSON-LD structured data from a page and inventory the schema.org types found. Flags the types that matter for AI discoverability (Organization, WebSite, Article, FAQPage, BreadcrumbList, Person) and sameAs entity disambiguation.",
      inputSchema: { url: URL_FIELD },
    },
    async (args) => detectSchemaMarkup(fetcher, args),
  );

  server.registerTool(
    "check_meta_directives",
    {
      title: "Check indexing and AI meta directives",
      description:
        "Report indexing directives from meta robots tags (including bot-specific and noai/noimageai tags) and X-Robots-Tag response headers for a page.",
      inputSchema: { url: URL_FIELD },
    },
    async (args) => checkMetaDirectives(fetcher, args),
  );

  return server;
}
```

Note: if the installed SDK version does not have `registerTool`, use the older `server.tool(name, description, schemaShape, handler)` signature instead; check `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` for the exact API and keep the same four registrations.

- [ ] **Step 4: Replace `src/index.ts`**

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

const server = buildServer();
await server.connect(new StdioServerTransport());
// stdout is the MCP protocol channel; log to stderr only.
console.error("geo-inspector-mcp running on stdio");
```

- [ ] **Step 5: Run the full suite and the build**

Run: `npx vitest run`
Expected: all test files pass (url, crawlers, fetch, robots-parser, robots-tool, llms-parser, llms-tool, json-ld-parser, schema-tool, meta-parser, meta-tool, server).

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run build`
Expected: `dist/index.js` produced, first line contains the shebang. Verify with: `node -e "const l=require('fs').readFileSync('dist/index.js','utf8').split('\n')[0]; console.log(l)"`

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/index.ts tests/server.test.ts
git commit -m "feat: wire all four tools into the stdio MCP server"
```

---

### Task 16: Live verification against real sites

No new files. This validates the built server end to end. Network required.

- [ ] **Step 1: List tools through the Inspector CLI**

Run: `npx --yes @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list`
Expected: JSON listing the four tools.

- [ ] **Step 2: Call each tool against a real site**

```bash
npx --yes @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name check_robots_txt --tool-arg url=nytimes.com
npx --yes @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name fetch_llms_txt --tool-arg url=docs.anthropic.com
npx --yes @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name detect_schema_markup --tool-arg url=https://www.bbc.com/news
npx --yes @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name check_meta_directives --tool-arg url=https://en.wikipedia.org/wiki/Web_crawler
```

Expected: each returns a non-error result with sensible findings (nytimes.com blocks several AI crawlers; docs.anthropic.com serves llms.txt; the BBC page carries JSON-LD; the Wikipedia page is indexable). If a specific site is down or has changed behavior, substitute a comparable site and note it. If a call fails, debug the tool (not the site) first: reproduce with a unit test using the site's actual response body.

- [ ] **Step 3: Register in Claude Code and exercise once**

Run: `claude mcp add geo-inspector -- node C:/Users/Nick/geo-inspector-mcp/dist/index.js`
Then in a Claude Code session ask: "Use geo-inspector to check which AI crawlers nytimes.com blocks." Confirm the tool fires and the answer reflects the structured output. Remove afterwards if not wanted: `claude mcp remove geo-inspector`.

- [ ] **Step 4: Record verification in the worklog**

Append a short section to the bottom of `docs/superpowers/plans/2026-07-02-geo-inspector-mcp.md` titled `## Live verification log` listing date, commands run, and one-line outcomes. Commit:

```bash
git add docs/superpowers/plans/2026-07-02-geo-inspector-mcp.md
git commit -m "docs: record live verification results"
```

---

### Task 17: README, LICENSE, and publish readiness

**Files:**
- Create: `README.md`, `LICENSE`

- [ ] **Step 1: Write `LICENSE`** (MIT)

```
MIT License

Copyright (c) 2026 Nick Hernandez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `README.md`**

````markdown
# geo-inspector-mcp

Inspect any website's AI-search readiness from Claude (or any MCP client): which AI crawlers it blocks, whether it publishes llms.txt, what schema markup it ships, and how its indexing directives are set.

<!-- demo GIF goes here: record a Claude Code session calling the tools -->

## Why this exists

AI assistants are becoming a primary way people find and cite content, and sites signal their intent to AI systems through a handful of plumbing files: robots.txt rules for AI crawlers, the emerging llms.txt standard, schema.org structured data, and meta directives. Checking those by hand means juggling curl, a robots.txt parser in your head, and view-source. This server turns all of it into questions you can just ask Claude.

## Quickstart

```bash
npx -y geo-inspector-mcp
```

That is the whole install. Point your MCP client at it:

**Claude Code**

```bash
claude mcp add geo-inspector -- npx -y geo-inspector-mcp
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "geo-inspector": {
      "command": "npx",
      "args": ["-y", "geo-inspector-mcp"]
    }
  }
}
```

Then ask things like: "Which AI crawlers does nytimes.com block?" or "Does stripe.com publish an llms.txt?"

## Tools

| Tool | What it checks | Example question |
| --- | --- | --- |
| `check_robots_txt` | Which AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and more) are allowed or blocked, per RFC 9309, plus sitemaps | "Can OpenAI train on example.com?" |
| `fetch_llms_txt` | Presence and spec-validity of /llms.txt and /llms-full.txt | "Has example.com adopted llms.txt?" |
| `detect_schema_markup` | JSON-LD blocks, schema.org type inventory, AI-relevant types, sameAs disambiguation | "What structured data does this article have?" |
| `check_meta_directives` | Meta robots tags (including noai/noimageai and bot-specific tags) and X-Robots-Tag headers | "Is this page indexable?" |

Every tool returns a readable summary plus structured JSON (`structuredContent`) for programmatic use.

## Development

```bash
npm install
npm test        # vitest unit + integration tests
npm run build   # bundle to dist/
npx @modelcontextprotocol/inspector node dist/index.js   # poke it interactively
```

Parsers are pure functions with fixture-based tests; all HTTP goes through one capped, redirect-limited fetch helper.

## License

MIT
````

- [ ] **Step 3: Final full pass**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: README and MIT license"
```

---

## Live verification log

Date: 2026-07-03. All calls made through `npx @modelcontextprotocol/inspector --cli node dist/index.js` against the built bundle.

- `tools/list`: returns exactly check_robots_txt, fetch_llms_txt, detect_schema_markup, check_meta_directives
- `check_robots_txt url=nytimes.com`: 15/15 AI crawlers blocked, matches NYT's published policy; sitemaps surfaced
- `fetch_llms_txt url=docs.anthropic.com`: first run exposed a design bug (llms-full.txt exceeds the 2 MB cap and the tool errored); fixed so oversized files report `present: true, oversized: true`, test added, spec updated. Re-run: llms.txt present and valid (title "Anthropic Developer Documentation", 3 sections), llms-full.txt present and oversized
- `detect_schema_markup url=https://www.bbc.com/news`: 1 JSON-LD block (WebPage), AI-relevant gaps flagged
- `check_meta_directives url=https://en.wikipedia.org/wiki/Web_crawler`: indexable, followable, `max-image-preview:standard` captured, no AI restrictions
- Claude Code: `claude mcp add geo-inspector -- node C:/Users/Nick/geo-inspector-mcp/dist/index.js` then `claude mcp list` reports "geo-inspector: ... - Connected" (local scope, this project directory). Remove with `claude mcp remove geo-inspector` if unwanted.

## Ship-time steps (require Nick, not part of this plan's execution)

1. Choose the GitHub account, create the public repo, add the remote. Pushing requires Nick's explicit say-so.
2. Record the demo GIF and replace the README placeholder comment.
3. `npm publish` (needs Nick's npm login; `prepublishOnly` guards the quality gate).
4. Submit to MCP registries/directories.
5. Optionally add the repo URL to the fetch helper's User-Agent string.
