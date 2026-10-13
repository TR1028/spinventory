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

export const TIMED_OUT: unique symbol = Symbol("timed out");

/**
 * Settles like `promise`, or resolves to {@link TIMED_OUT} when it is still pending after `ms`. The
 * timer belongs to the calling request, so it fires even if `promise` can never settle.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
