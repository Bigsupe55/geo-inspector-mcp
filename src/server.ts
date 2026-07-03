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
