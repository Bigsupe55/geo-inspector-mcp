#!/usr/bin/env node
/**
 * Capture real tool output for the README demo GIF.
 *
 * Spawns the BUILT server and talks to it over MCP stdio as a client would, then
 * writes every response verbatim to scripts/demo-data.json. Nothing is mocked:
 * if a site changes its robots.txt, re-running this changes the demo.
 *
 *   npm run build && npm run demo:capture
 *
 * The JSON is committed so `demo:render` works offline and so the GIF's claims
 * stay auditable: anyone can diff the data against what the tools return today.
 */
import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SERVER = resolve(ROOT, "dist", "index.js");
const OUT = resolve(HERE, "demo-data.json");

/**
 * The demo script. `question` is the only authored text in the whole pipeline;
 * everything else comes off the wire. Sites were picked because their real
 * answers are interesting, not because they flatter the tool.
 */
const SCENES = [
  {
    question: "Which AI crawlers does nytimes.com block?",
    tool: "check_robots_txt",
    args: { url: "https://www.nytimes.com" },
  },
  {
    question: "Does docs.anthropic.com publish an llms.txt?",
    tool: "fetch_llms_txt",
    args: { url: "https://docs.anthropic.com" },
  },
  {
    question: "What structured data does stripe.com ship?",
    tool: "detect_schema_markup",
    args: { url: "https://stripe.com" },
  },
];

if (!existsSync(SERVER)) {
  console.error(`No build found at ${SERVER}\nRun \`npm run build\` first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
child.on("error", (e) => {
  console.error("Failed to start server:", e.message);
  process.exit(1);
});

let buf = "";
const pending = new Map();

child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // not a JSON-RPC frame, ignore
    }
    const resolveFn = pending.get(msg.id);
    if (resolveFn) {
      pending.delete(msg.id);
      resolveFn(msg);
    }
  }
});
// The server logs its banner to stderr; surface real errors, drop the banner.
child.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s && !/running on stdio/.test(s)) console.error("[server]", s);
});

let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      rej(new Error(`${method} timed out after 45s`));
    }, 45_000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      res(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

try {
  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "demo-capture", version: "1.0.0" },
  });
  const serverInfo = init.result?.serverInfo ?? {};
  console.log(`connected: ${serverInfo.name} v${serverInfo.version}`);
  notify("notifications/initialized", {});

  const scenes = [];
  for (const scene of SCENES) {
    process.stdout.write(`  ${scene.tool} ${scene.args.url} ... `);
    const res = await request("tools/call", { name: scene.tool, arguments: scene.args });
    if (res.error) throw new Error(`${scene.tool}: ${res.error.message}`);
    const text = res.result?.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error(`${scene.tool} returned no text content`);
    console.log(`${text.split("\n").length} line(s)`);
    scenes.push({
      question: scene.question,
      call: `${scene.tool}(url: ${JSON.stringify(scene.args.url)})`,
      output: text.split("\n"),
    });
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _comment:
          "Verbatim tool output captured by scripts/capture-demo.mjs. Regenerate with " +
          "`npm run build && npm run demo:capture`. Only `question` is authored.",
        capturedAt: new Date().toISOString(),
        server: serverInfo,
        scenes,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nwrote ${OUT}`);
} catch (err) {
  console.error("\ncapture failed:", err.message);
  child.kill();
  process.exit(1);
}

child.kill();
process.exit(0);
