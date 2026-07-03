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
