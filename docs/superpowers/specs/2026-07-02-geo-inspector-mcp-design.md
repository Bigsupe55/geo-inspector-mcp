# geo-inspector-mcp: Design Spec

Date: 2026-07-02
Status: Approved by Nick (design conversation, 2026-07-02)

## Overview

`geo-inspector-mcp` is a public, portfolio-grade MCP server that lets any MCP client (Claude Code, Claude Desktop, etc.) inspect a website's AI-search readiness. It wraps fetch + parse into four focused tools: AI crawler access via robots.txt, llms.txt presence and validity, JSON-LD schema markup, and indexing meta directives.

**Why it exists (product goal):** Nick needs one small, polished, public repo as portfolio evidence for applied-AI roles. His GEO agency tooling stays private. This server proves his MCP certifications translate to shipped work, stays in his GEO/SEO domain, and gets organic discovery via MCP directories. The README is the product as much as the code.

**Clean-room constraint:** Nothing is copied from Nick's private GEO tooling. All logic is derived from public specs: RFC 9309 (robots.txt), llmstxt.org (llms.txt), schema.org (structured data types), and public crawler documentation.

## Goals

- Four working MCP tools, callable from Claude Code and Claude Desktop over stdio
- `npx -y geo-inspector-mcp` works with zero setup
- Fixture-based unit tests for every parser
- A README good enough to be the centerpiece of a LinkedIn Featured section

## Non-goals (v1)

- `citability_snapshot` tool (headings structure, word counts, Q&A patterns): deferred to v1.1
- Microdata / RDFa extraction: JSON-LD only
- JavaScript rendering: static HTML fetch only; SPA content that requires JS is out of scope and reported as such when detectable
- Crawling multiple pages: every tool operates on one URL per call
- HTTP transport for the MCP server: stdio only

## Architecture

Language: TypeScript (strict), ESM, Node >= 20.
Runtime deps: `@modelcontextprotocol/sdk`, `zod`, `node-html-parser`. Nothing else.
Dev deps: `typescript`, `tsup`, `vitest`, `@types/node`.

Three layers, dependency direction strictly downward:

1. **Server wiring** (`src/index.ts`, `src/server.ts`): entry point with shebang, registers the four tools with zod input schemas, connects stdio transport. No business logic.
2. **Tools** (`src/tools/*.ts`): one module per tool. Each orchestrates: normalize URL, call fetch helper, call parser, build the MCP result (text summary + structuredContent). Fetch is passed in as a parameter so tests can stub it.
3. **Parsers** (`src/parsers/*.ts`): pure functions, string in, typed result out, no network, no side effects. This is where all the tested logic lives.

Shared modules:

- `src/fetch.ts`: the only place HTTP happens. Native `fetch` (undici). 10 second timeout via AbortSignal, max 5 redirects, 2 MB response cap (streamed check, abort past cap), http/https schemes only, User-Agent `geo-inspector-mcp/<version> (+https://github.com/<owner>/geo-inspector-mcp)`. Returns a discriminated result: `{ok: true, status, headers, body, finalUrl}` or `{ok: false, error: {kind, message}}` with `kind` one of `invalid_url | dns | timeout | http_error | too_large | not_text`.
- `src/crawlers.ts`: registry of known AI crawlers, each entry `{name, vendor, purpose}` where purpose is `training | search | user_fetch`. Initial list: GPTBot, ChatGPT-User, OAI-SearchBot (OpenAI); ClaudeBot, anthropic-ai, Claude-User, Claude-SearchBot (Anthropic); PerplexityBot, Perplexity-User (Perplexity); Google-Extended (Google); CCBot (Common Crawl); Bytespider (ByteDance); Applebot-Extended (Apple); meta-externalagent (Meta); cohere-ai (Cohere). One file so the list is trivially extendable.
- `src/url.ts`: URL normalization. Accepts `example.com`, `https://example.com/page`, etc. Prepends `https://` when scheme is missing. Exposes `toOrigin(url)` for root-file tools and `toPageUrl(url)` for page tools. Rejects non-http(s) with `invalid_url`.

Repo layout:

```
geo-inspector-mcp/
  src/
    index.ts
    server.ts
    fetch.ts
    url.ts
    crawlers.ts
    tools/
      robots.ts
      llms-txt.ts
      schema-markup.ts
      meta-directives.ts
    parsers/
      robots.ts
      llms-txt.ts
      json-ld.ts
      meta-robots.ts
  tests/
    fixtures/
    *.test.ts
  docs/superpowers/specs/
  README.md
  LICENSE (MIT)
  package.json
  tsconfig.json
```

## Tool contracts

All four tools take `url: string` (zod-validated, scheme optional). Each returns an MCP tool result with a concise human-readable `text` block and a `structuredContent` object. Site-root tools (`check_robots_txt`, `fetch_llms_txt`) resolve the origin from whatever URL is given; page tools (`detect_schema_markup`, `check_meta_directives`) fetch the exact page.

### 1. check_robots_txt

Input: `{url: string, path?: string}` where `path` defaults to `/` and is the path whose access is evaluated.

Fetches `<origin>/robots.txt`. Parses per RFC 9309:

- Groups: consecutive `User-agent` lines share the following rules
- Agent matching is case-insensitive; most-specific agent token wins; `*` is the fallback group
- Rule precedence: longest-match wins; on a tie, `Allow` wins
- `*` wildcard and `$` end-anchor supported in paths
- Unknown directives ignored; `Sitemap:` lines collected globally; BOM tolerated

structuredContent:

```json
{
  "robotsUrl": "https://example.com/robots.txt",
  "fetched": true,
  "status": 200,
  "path": "/",
  "sitemaps": ["https://example.com/sitemap.xml"],
  "groupCount": 3,
  "crawlers": [
    {
      "name": "GPTBot",
      "vendor": "OpenAI",
      "purpose": "training",
      "access": "blocked",
      "matchedGroup": "GPTBot",
      "matchedRule": "Disallow: /"
    }
  ]
}
```

`access` is `allowed | blocked`. Status handling follows RFC 9309 section 2.3.1: any 4xx (including 404 and 403) reports `fetched: false` and every crawler `allowed`, with a note in the text summary; any 5xx reports every crawler `blocked` with the note that RFC 9309 treats an unreachable robots.txt as complete disallow. Network-level failures (DNS, timeout) return an isError result.

### 2. fetch_llms_txt

Input: `{url: string}`.

Checks `<origin>/llms.txt` and `<origin>/llms-full.txt`. `llms.txt` gets full structural validation against the llms.txt spec (llmstxt.org); `llms-full.txt` is expanded content by design, so it gets presence, size, and an H1 check only:

- Exactly one H1 (the site/project name), required
- Optional blockquote summary immediately after the H1
- Zero or more H2 sections whose content is markdown link lists (`- [name](url): optional description`)
- Warnings (not failures) for: missing H1, content before H1, sections without links, non-list content in sections, HTML instead of markdown (signals a misconfigured server returning an error page)

structuredContent:

```json
{
  "files": [
    {
      "file": "llms.txt",
      "url": "https://example.com/llms.txt",
      "present": true,
      "status": 200,
      "bytes": 1234,
      "valid": true,
      "title": "Example",
      "hasSummary": true,
      "sections": [{"name": "Docs", "linkCount": 4}],
      "warnings": []
    },
    {"file": "llms-full.txt", "present": false, "status": 404}
  ]
}
```

Neither file present is a normal (not error) result: presence is exactly what the tool reports.

### 3. detect_schema_markup

Input: `{url: string}`.

Fetches the page HTML, extracts every `<script type="application/ld+json">` block with node-html-parser, `JSON.parse`s each block (a failed parse increments `parseErrors` and records the error, it never crashes the tool), flattens `@graph` arrays and top-level arrays, and inventories `@type` values (string or array forms).

AI-relevant checklist types: Organization, WebSite, Article (plus subtypes NewsArticle, BlogPosting), FAQPage, BreadcrumbList, Person. For Organization and Person nodes, reports whether `sameAs` is present (entity disambiguation matters for AI citation).

structuredContent:

```json
{
  "pageUrl": "https://example.com/",
  "blockCount": 3,
  "parseErrors": 0,
  "typeCounts": {"Organization": 1, "BlogPosting": 2},
  "aiRelevant": {
    "Organization": true,
    "WebSite": false,
    "Article": true,
    "FAQPage": false,
    "BreadcrumbList": false,
    "Person": false
  },
  "entities": [
    {"types": ["Organization"], "name": "Example Inc", "hasSameAs": true}
  ]
}
```

`Article: true` when Article or any listed subtype is present. Pages with zero JSON-LD blocks are a normal result.

### 4. check_meta_directives

Input: `{url: string}`.

Fetches the page and reports indexing/AI directives from both channels:

- Meta tags: `<meta name="robots|googlebot|gptbot|claudebot|...">` (any name that is `robots` or a known crawler name), content split on commas into directives. Also detects `noai` / `noimageai` meta tags regardless of the name attribute convention used.
- HTTP headers: every `X-Robots-Tag` header, parsed as `[agent:] directive[, directive]`.

structuredContent:

```json
{
  "pageUrl": "https://example.com/",
  "status": 200,
  "metaTags": [
    {"name": "robots", "directives": ["noindex", "nofollow"]}
  ],
  "xRobotsTag": [
    {"agent": null, "directives": ["noai"]}
  ],
  "summary": {"indexable": false, "followable": false, "aiDirectives": ["noai"]}
}
```

`summary.indexable` is false when any applicable channel says `noindex` (or `none`); same logic for `nofollow`/`followable`. `aiDirectives` collects `noai`, `noimageai`, and crawler-specific `noindex` entries aimed at AI agents.

## Error handling

- Tools never throw to the MCP client. Fetch failures map to `isError: true` results whose text names the failure kind and the URL, e.g. `Could not fetch https://example.com/robots.txt: request timed out after 10s`.
- Expected absences (404 on robots.txt or llms.txt, zero JSON-LD blocks, no meta directives) are successful results that say so; absence of these files is a finding, not an error.
- Responses whose content-type is not text/HTML where HTML is required map to `not_text`.
- Parser functions are total: any string input produces a result or a structured warning list, never an exception.

## Testing

Framework: vitest. All parser logic is covered by fixture-based unit tests; fixtures live in `tests/fixtures/`.

- robots parser: multi-agent groups, `*` fallback, longest-match precedence, Allow/Disallow tie, `$` anchor, `*` wildcard, case-insensitive agents, BOM, CRLF, comments, empty file, sitemap collection, a realistic large fixture modeled on publisher-style robots.txt that blocks many AI agents
- llms.txt parser: spec-conformant file, missing H1, HTML error page served as llms.txt, sections without links, empty file
- JSON-LD parser: single object, top-level array, `@graph`, `@type` as array, broken JSON among valid blocks, no scripts at all, sameAs detection
- meta-robots parser: multiple meta tags, bot-specific tags, noai variants, X-Robots-Tag with and without agent prefix, conflicting directives
- tools: fetch helper injected as a stub; happy path plus one failure path per tool
- fetch helper: URL normalization and scheme rejection tested directly; timeout/size-cap behavior covered by unit tests with a local in-process server if cheap, otherwise stubbed

Live verification before declaring done: MCP Inspector session against real sites (one that blocks AI crawlers, one with llms.txt, one with rich JSON-LD), then register the built server in Claude Code and call all four tools.

## Packaging and publishing

- package.json: `name: geo-inspector-mcp`, `type: module`, `bin: {"geo-inspector-mcp": "dist/index.js"}`, `files: ["dist"]`, `engines.node: ">=20"`, MIT license, keywords for MCP directory discovery (mcp, model-context-protocol, seo, geo, ai-search, robots-txt, llms-txt, schema-org)
- Build: tsup, ESM output, shebang preserved on index
- Version starts at 0.1.0; publish to npm under Nick's account (ship-time step, requires Nick's npm login)
- GitHub repo public under Nick's account; which GitHub account is a ship-time decision for Nick
- README structure, in order: title + one-line tagline, demo GIF placeholder, "Why this exists" paragraph, 3-line quickstart, Claude Desktop and Claude Code config snippets (`npx -y geo-inspector-mcp`), tool reference table (name, what it checks, example question to ask Claude), development section (install, test, build), license
- MCP registry/directory submission happens after npm publish (post-ship, per handoff)

## Milestones (implementation order)

1. Scaffold: package.json, tsconfig, vitest, tsup, empty server that starts and lists zero tools
2. fetch.ts + url.ts + crawlers.ts with tests
3. robots parser + check_robots_txt tool (TDD, fixtures first)
4. llms.txt parser + fetch_llms_txt tool
5. JSON-LD parser + detect_schema_markup tool
6. meta-robots parser + check_meta_directives tool
7. Wire all tools into server.ts, live verification (Inspector + Claude Code)
8. README, license, polish, final lint/typecheck/test pass
