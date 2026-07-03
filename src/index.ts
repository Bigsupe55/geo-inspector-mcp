#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

const server = buildServer();
await server.connect(new StdioServerTransport());
// stdout is the MCP protocol channel; log to stderr only.
console.error("geo-inspector-mcp running on stdio");
