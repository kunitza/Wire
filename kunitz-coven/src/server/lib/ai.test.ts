import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../db.js";
import { Bus, SettingsStore, type Ctx } from "../context.js";
import { extractEvents, planMeals } from "./ai.js";

// Exercises the real Anthropic SDK against a local stand-in for the API, so the request shape
// (model, beta header, fallbacks, structured output schema, image/PDF blocks) is checked end to end.
let server: http.Server;
let lastBody: Record<string, unknown> = {};
let lastHeaders: http.IncomingHttpHeaders = {};
let reply: unknown = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      lastHeaders = req.headers;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: lastBody.model,
          content: [{ type: "text", text: JSON.stringify(reply) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 300 },
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

function makeCtx(): Ctx {
  const db = openDb(":memory:");
  const ctx: Ctx = {
    db,
    bus: new Bus(),
    settings: new SettingsStore(db),
    config: {
      port: 0, host: "", dataDir: "/tmp", dbFile: ":memory:", webDir: "", anthropicApiKey: "sk-ant-test",
      aiModel: "claude-opus-5-5", displayOffCmd: null, displayOnCmd: null, disableBackground: true,
    },
    now: () => new Date("2026-10-07T10:00:00-04:00"),
  };
  return ctx;
}

describe("Claude requests", () => {
  it("sends a structured-output request with fallbacks and attachments, and records cost", async () => {
    const ctx = makeCtx();
    reply = { summary: "1 event", events: [{ title: "Picture day", allDay: true, start: "2026-10-15", end: "2026-10-16", location: "", notes: "", profileNames: ["Emma"] }] };
    const out = await extractEvents(ctx, {
      text: "Picture day Oct 15",
      files: [
        { mediaType: "image/jpeg", base64: Buffer.from("x").toString("base64") },
        { mediaType: "application/pdf", base64: Buffer.from("%PDF").toString("base64") },
      ],
      profiles: [{ id: 7, name: "Emma" }],
      defaultProfileIds: [],
    });
    expect(out.events[0]).toMatchObject({ title: "Picture day", profileIds: [7] });
    expect(lastBody.model).toBe("claude-opus-5-5");
    expect(lastBody.fallbacks).toBe("default");
    expect(String(lastHeaders["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect((lastBody.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(lastBody.thinking).toBeUndefined();
    const content = (lastBody.messages as { content: { type: string }[] }[])[0].content.map((b) => b.type);
    expect(content).toEqual(["image", "document", "text"]);
    const spent = ctx.db.prepare("SELECT SUM(cost_usd) AS s FROM ai_usage").get() as { s: number };
    expect(spent.s).toBeCloseTo((1200 * 4 + 300 * 20) / 1e6);
  });

  it("uses only schema features structured outputs support", async () => {
    const ctx = makeCtx();
    reply = { meals: [{ date: "2026-10-08", existingRecipeId: null, title: "Tacos", emoji: "🌮", ingredients: [], instructions: "" }] };
    const meals = await planMeals(ctx, { category: "Dinner", prompt: "", dates: ["2026-10-08"], servings: 4, mode: "new", recipes: [] });
    expect(meals[0].title).toBe("Tacos");
    const schema = JSON.stringify((lastBody.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).not.toMatch(/"type":\[/); // no type arrays; nullable fields use anyOf
    expect(schema).not.toMatch(/minimum|maximum|minLength|maxLength/);
  });

  it("stops at the monthly budget", async () => {
    const ctx = makeCtx();
    ctx.settings.set("ai", { monthlyBudgetUsd: 0 });
    await expect(planMeals(ctx, { category: "Dinner", prompt: "", dates: ["2026-10-08"], servings: 4, mode: "new", recipes: [] })).rejects.toThrow(/budget/);
  });
});
