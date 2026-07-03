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
