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
