/**
 * Spinventory cloud API: Cloudflare Worker (Hono) backed by D1.
 *
 * Each mutation loads the slice of the user's data it needs, runs the shared planner from
 * `src/db/domain.ts` (the same code Local Mode runs against IndexedDB), persists the resulting
 * delta in one D1 batch (a transaction) and responds with `{ delta, id? }` so the client can merge
 * it into its in-memory snapshot without refetching.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  DomainError,
  planCreateBoostingLog,
  planCreatePlaySession,
  planCreateRacket,
  planCreateRubber,
  planDeleteBoostingLog,
  planDeletePlaySession,
  planDeleteRacket,
  planDeleteRubber,
  planReplaceRubber,
  planUpdateBoostingLog,
  planUpdatePlaySession,
  planUpdateRacket,
  planUpdateRubber,
  type CreateBoostingLogInput,
  type CreatePlaySessionInput,
  type CreateRacketInput,
  type CreateRubberInput,
  type DomainContext,
  type DomainResult,
  type ReplaceRubberInput,
} from "../src/db/domain";
import type { AppSnapshot, MutationResponse } from "../src/db/schema";
import { authGuard, authRoutes } from "./auth";
import {
  ensureSchema,
  ImportTooLargeError,
  importSnapshot,
  loadScope,
  loadSnapshot,
  persistDelta,
  type SnapshotScope,
} from "./db";
import { readJsonObject } from "./http";
import type { AppContext, AppEnv } from "./types";

const app = new Hono<AppEnv>();

function resolveCorsOrigin(origin: string, configured: string | undefined) {
  const allowed = (configured ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowed.length || allowed.includes("*")) return "*";
  return allowed.includes(origin) ? origin : null;
}

app.use(
  "*",
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, (c.env as AppEnv["Bindings"] | undefined)?.CORS_ORIGINS),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86_400,
  }),
);
app.use("/api/*", authGuard);
// Adds columns that a database created from an older schema.sql lacks (see worker/migrate_v2.sql).
app.use("/api/*", async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

app.get("/", (c) => c.json({ name: "spinventory-api", status: "ok" }));
app.get("/api/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));
app.route("/api/auth", authRoutes);

// ---------------------------------------------------------------------------
// Snapshot & import
// ---------------------------------------------------------------------------

app.get("/api/snapshot", async (c) => {
  const snapshot: AppSnapshot = await loadSnapshot(c.env.DB, c.get("user").id);
  return c.json(snapshot);
});

app.post("/api/sync/import", async (c) => {
  const payload = await readJsonObject(c);
  return c.json(await importSnapshot(c.env.DB, c.get("user").id, payload, new Date().toISOString()));
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function createServerContext(): DomainContext {
  const now = new Date().toISOString();
  return { now, today: now.slice(0, 10), createId: (prefix) => `${prefix}-${crypto.randomUUID()}` };
}

async function runMutation(
  c: AppContext,
  scope: SnapshotScope,
  plan: (snapshot: AppSnapshot, ctx: DomainContext) => DomainResult,
) {
  const userId = c.get("user").id;
  const snapshot = await loadScope(c.env.DB, userId, scope);
  const { delta, id } = plan(snapshot, createServerContext());
  await persistDelta(c.env.DB, userId, delta);
  const body: MutationResponse = id ? { delta, id } : { delta };
  return c.json(body, id ? 201 : 200);
}

const stringIds = (...values: unknown[]) => values.filter((value): value is string => typeof value === "string" && value !== "");

/** Ids of inventory rubbers referenced by `{ type: "inventory", rubberId }` sources. */
function inventorySourceIds(...sources: unknown[]) {
  return sources.flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    const { type, rubberId } = source as Record<string, unknown>;
    return type === "inventory" ? stringIds(rubberId) : [];
  });
}

// Rackets
app.post("/api/rackets", async (c) => {
  const body = await readJsonObject(c);
  return runMutation(
    c,
    { rackets: { all: true }, rubbers: { ids: inventorySourceIds(body.forehand, body.backhand) } },
    (snapshot, ctx) => planCreateRacket(snapshot, body as CreateRacketInput, ctx),
  );
});

app.put("/api/rackets/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  return runMutation(c, { rackets: { ids: [id] } }, (snapshot, ctx) => planUpdateRacket(snapshot, id, body, ctx));
});

app.delete("/api/rackets/:id", async (c) => {
  const id = c.req.param("id");
  return runMutation(
    c,
    { rackets: { ids: [id] }, rubbers: { racketIds: [id] }, boostingLogs: { racketIds: [id] }, playSessions: { racketIds: [id] } },
    (snapshot) => planDeleteRacket(snapshot, id),
  );
});

/** Atomic "retire the old rubber + mount a new or inventory rubber" (also fills empty slots). */
app.post("/api/rackets/:id/replace-rubber", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  return runMutation(
    c,
    { rackets: { ids: [id] }, rubbers: { racketIds: [id], ids: inventorySourceIds(body.source) } },
    (snapshot, ctx) => planReplaceRubber(snapshot, id, body as ReplaceRubberInput, ctx),
  );
});

// Rubbers
app.post("/api/rubbers", async (c) => {
  const body = await readJsonObject(c);
  return runMutation(c, {}, (snapshot, ctx) => planCreateRubber(snapshot, body as CreateRubberInput, ctx));
});

app.put("/api/rubbers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  return runMutation(
    c,
    { rubbers: { ids: [id] }, rackets: { mountingRubberIds: [id], ofRubberIds: [id] } },
    (snapshot, ctx) => planUpdateRubber(snapshot, id, body, ctx),
  );
});

app.delete("/api/rubbers/:id", async (c) => {
  const id = c.req.param("id");
  return runMutation(
    c,
    { rubbers: { ids: [id] }, rackets: { mountingRubberIds: [id] }, boostingLogs: { rubberIds: [id] } },
    (snapshot, ctx) => planDeleteRubber(snapshot, id, ctx),
  );
});

// Play sessions
app.post("/api/sessions", async (c) => {
  const body = await readJsonObject(c);
  return runMutation(c, { rackets: { ids: stringIds(body.racketId) } }, (snapshot, ctx) =>
    planCreatePlaySession(snapshot, body as CreatePlaySessionInput, ctx),
  );
});

app.put("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  return runMutation(c, { playSessions: { ids: [id] }, rackets: { ids: stringIds(body.racketId) } }, (snapshot) =>
    planUpdatePlaySession(snapshot, id, body),
  );
});

app.delete("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  return runMutation(c, { playSessions: { ids: [id] } }, (snapshot) => planDeletePlaySession(snapshot, id));
});

// Boosting logs (boost numbers and the rubber's `boosted` flag are recalculated by the planners)
app.post("/api/boosting-logs", async (c) => {
  const body = await readJsonObject(c);
  const rubberIds = stringIds(body.rubberId);
  return runMutation(c, { rubbers: { ids: rubberIds }, boostingLogs: { rubberIds } }, (snapshot, ctx) =>
    planCreateBoostingLog(snapshot, body as CreateBoostingLogInput, ctx),
  );
});

app.put("/api/boosting-logs/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  return runMutation(c, { boostingLogs: { siblingsOfIds: [id] } }, (snapshot) => planUpdateBoostingLog(snapshot, id, body));
});

app.delete("/api/boosting-logs/:id", async (c) => {
  const id = c.req.param("id");
  return runMutation(
    c,
    { boostingLogs: { siblingsOfIds: [id] }, rubbers: { ofBoostingLogIds: [id] } },
    (snapshot, ctx) => planDeleteBoostingLog(snapshot, id, ctx),
  );
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

app.notFound((c) => c.json({ error: "接口不存在" }, 404));

app.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  if (error instanceof ImportTooLargeError) return c.json({ error: error.message }, 413);
  if (error instanceof HTTPException) return c.json({ error: error.message || "请求无效" }, error.status);
  console.error("Unhandled API error", error);
  return c.json({ error: "服务器内部错误，请稍后再试" }, 500);
});

export default app;
