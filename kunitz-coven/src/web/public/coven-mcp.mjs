#!/usr/bin/env node
// Kunitz Coven bridge for Claude Desktop: relays MCP messages between Claude (stdio) and your Kunitz Coven hub (HTTP).
// No dependencies. Configure with the COVEN_URL and COVEN_TOKEN environment variables
// (both shown in Kunitz Coven → Settings → Claude connector).
import readline from "node:readline";

const url = process.env.COVEN_URL;
const token = process.env.COVEN_TOKEN;
if (!url || !token) {
  console.error("Set COVEN_URL and COVEN_TOKEN (see Kunitz Coven → Settings → Claude connector).");
  process.exit(1);
}

const write = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 202) return; // notification accepted
    const text = await res.text();
    if (!res.ok && !text.startsWith("{")) throw new Error(`Kunitz Coven replied ${res.status}`);
    process.stdout.write(text.trim() + "\n");
  } catch (e) {
    if (msg.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Can't reach Kunitz Coven at ${url}: ${e.message}` } });
  }
});
