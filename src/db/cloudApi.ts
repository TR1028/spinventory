/**
 * Typed client for the Spinventory Cloudflare Worker API (`worker/index.ts`).
 *
 * The base URL is the Worker address saved in this browser (「云端同步」→「服务器设置」) or, by
 * default, `VITE_API_BASE_URL`. When both are empty, requests go to `/api` on the current origin,
 * which the Vite dev server proxies to `wrangler dev` (see `vite.config.ts`).
 */
import type {
  CreateBoostingLogInput,
  CreatePlaySessionInput,
  CreateRacketInput,
  CreateRubberInput,
  ReplaceRubberInput,
  StashRubberInput,
  UpdateBoostingLogInput,
  UpdatePlaySessionInput,
  UpdateRacketInput,
  UpdateRubberInput,
} from "./domain";
import type {
  ApiErrorBody,
  AppSnapshot,
  AuthConfigResponse,
  AuthResponse,
  LoginRequest,
  MeResponse,
  MutationResponse,
  OAuthProvider,
  RegisterRequest,
  SyncImportRequest,
  SyncImportResponse,
} from "./schema";

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

/** localStorage key of the Worker URL entered in the app (overrides `VITE_API_BASE_URL`). */
export const API_BASE_URL_STORAGE_KEY = "spinventory:api-base-url";

/** Build-time Worker origin without a trailing slash; empty means "same origin". */
export const ENV_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/**
 * Where the active base URL comes from: a URL saved in this browser, `VITE_API_BASE_URL`, the Vite
 * dev proxy (development only), or nothing (cloud sync unavailable until a URL is entered).
 */
export type ApiBaseUrlSource = "custom" | "build" | "dev-proxy" | "none";

/**
 * Validates a Worker URL typed by the user and normalizes it (no trailing slash and no `/api`
 * suffix, since request paths already start with `/api`). Throws an `Error` with a Chinese message.
 */
export function parseApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的服务地址，例如 https://spinventory-api.你的账号.workers.dev");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("服务地址需以 https:// 或 http:// 开头");
  if (url.search || url.hash || url.username || url.password) throw new Error("服务地址不能包含查询参数、# 或账号信息");
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api$/i, "");
  return `${url.origin}${path}`;
}

/** Worker URL saved in this browser, if any (invalid stored values are ignored). */
export function readApiBaseUrlOverride(): string | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(API_BASE_URL_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!stored) return null;
  try {
    return parseApiBaseUrl(stored);
  } catch {
    return null;
  }
}

/** Saves (or, with `null`, forgets) the Worker URL override; resolves to the normalized URL. */
export function writeApiBaseUrlOverride(value: string | null) {
  const normalized = value === null ? null : parseApiBaseUrl(value);
  try {
    if (normalized) window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
    else window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  } catch {
    throw new Error("浏览器无法保存设置（可能处于隐私模式）");
  }
  return normalized;
}

/** Active Worker origin without a trailing slash; empty means "same origin" (the dev proxy). */
export function getApiBaseUrl() {
  return readApiBaseUrlOverride() ?? ENV_API_BASE_URL;
}

export function getApiBaseUrlSource(): ApiBaseUrlSource {
  if (readApiBaseUrlOverride()) return "custom";
  if (ENV_API_BASE_URL) return "build";
  return import.meta.env.DEV ? "dev-proxy" : "none";
}

/** Cloud sync needs a Worker URL, except in development where Vite proxies `/api`. */
export function isCloudConfigured() {
  return getApiBaseUrlSource() !== "none";
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the API (offline, DNS, CORS, ...). */
  readonly status: number;
  /** No response within the time limit: the server may still have applied the request. */
  readonly timedOut: boolean;

  constructor(message: string, status: number, timedOut = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.timedOut = timedOut;
  }
}

/** Longest wait for an API response; a hung connection must never leave the UI waiting (「保存中…」). */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Uploading all local records can take longer. */
const IMPORT_TIMEOUT_MS = 45_000;
const TIMEOUT_MESSAGE = "连接云端超时，请检查网络后重试";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type RequestOptions = { method?: HttpMethod; body?: unknown; token?: string; signal?: AbortSignal; timeoutMs?: number };

function readErrorMessage(data: unknown) {
  const message = data && typeof data === "object" ? (data as Partial<ApiErrorBody>).error : undefined;
  return typeof message === "string" && message ? message : undefined;
}

async function request<T>(
  path: string,
  { method = "GET", body, token, signal, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl && !import.meta.env.DEV) {
    throw new ApiError("尚未配置云端服务地址，请在「云端同步」→「服务器设置」中填写 Worker 地址", 0);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  // Aborted by the caller's `signal` or, when no response arrives in time, by the timeout.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort);

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new ApiError(TIMEOUT_MESSAGE, 0, true);
    throw new ApiError("无法连接云端服务，请检查网络后重试", 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    throw new ApiError(readErrorMessage(data) ?? `云端请求失败（HTTP ${response.status}）`, response.status);
  }
  // A 200 HTML page usually means the base URL points at the static site instead of the Worker.
  if (data === undefined) throw new ApiError("云端返回了无法识别的响应，请检查 API 地址配置", response.status);
  return data as T;
}

/** Expiry of a JWT in epoch milliseconds (read without verifying; the Worker verifies it). */
export function readTokenExpiry(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Unauthenticated endpoints. */
export const authApi = {
  config: (signal?: AbortSignal) => request<AuthConfigResponse>("/api/auth/config", { signal }),
  register: (body: RegisterRequest) => request<AuthResponse>("/api/auth/register", { method: "POST", body }),
  login: (body: LoginRequest) => request<AuthResponse>("/api/auth/login", { method: "POST", body }),
  /** Reserved for third-party sign-in (the Worker currently answers 501 Not Implemented). */
  oauthStartUrl: (provider: OAuthProvider) => `${getApiBaseUrl()}/api/auth/oauth/${provider}`,
};

/** Endpoints that act on behalf of the signed-in user. */
export function createCloudApi(token: string) {
  const send = <T>(method: HttpMethod, path: string, body?: unknown) => request<T>(path, { method, body, token });
  const mutation = (method: HttpMethod, path: string, body?: unknown) => send<MutationResponse>(method, path, body);
  const item = (collection: string, id: string, suffix = "") => `/api/${collection}/${encodeURIComponent(id)}${suffix}`;

  return {
    me: (signal?: AbortSignal) => request<MeResponse>("/api/auth/me", { token, signal }),
    snapshot: (signal?: AbortSignal) => request<AppSnapshot>("/api/snapshot", { token, signal }),
    importLocalData: (snapshot: SyncImportRequest) =>
      request<SyncImportResponse>("/api/sync/import", { method: "POST", body: snapshot, token, timeoutMs: IMPORT_TIMEOUT_MS }),

    createRacket: (input: CreateRacketInput) => mutation("POST", "/api/rackets", input),
    updateRacket: (id: string, input: UpdateRacketInput) => mutation("PUT", item("rackets", id), input),
    deleteRacket: (id: string) => mutation("DELETE", item("rackets", id)),
    replaceRubber: (racketId: string, input: ReplaceRubberInput) =>
      mutation("POST", item("rackets", racketId, "/replace-rubber"), input),

    createRubber: (input: CreateRubberInput) => mutation("POST", "/api/rubbers", input),
    updateRubber: (id: string, input: UpdateRubberInput) => mutation("PUT", item("rubbers", id), input),
    deleteRubber: (id: string) => mutation("DELETE", item("rubbers", id)),
    stashRubber: (id: string, input: StashRubberInput) => mutation("POST", item("rubbers", id, "/stash"), input),

    createPlaySession: (input: CreatePlaySessionInput) => mutation("POST", "/api/sessions", input),
    updatePlaySession: (id: string, input: UpdatePlaySessionInput) => mutation("PUT", item("sessions", id), input),
    deletePlaySession: (id: string) => mutation("DELETE", item("sessions", id)),

    createBoostingLog: (input: CreateBoostingLogInput) => mutation("POST", "/api/boosting-logs", input),
    updateBoostingLog: (id: string, input: UpdateBoostingLogInput) => mutation("PUT", item("boosting-logs", id), input),
    deleteBoostingLog: (id: string) => mutation("DELETE", item("boosting-logs", id)),
  };
}

export type CloudApi = ReturnType<typeof createCloudApi>;
