import { HTTPException } from "hono/http-exception";
import type { AppContext } from "./types";

/** Parses the request body as a JSON object (400 otherwise). */
export async function readJsonObject(c: AppContext): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "请求体必须是 JSON" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "请求体必须是 JSON 对象" });
  }
  return body as Record<string, unknown>;
}
