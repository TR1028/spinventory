/**
 * Accounts and tokens with zero crypto dependencies (Web Crypto `crypto.subtle` only):
 * - passwords: PBKDF2-HMAC-SHA256 with a random 16-byte salt, stored as
 *   `pbkdf2_sha256$<iterations>$<salt>$<hash>` (base64url) so parameters can evolve;
 * - sessions: HS256 JWT signed with the `JWT_SECRET` secret, sent as `Authorization: Bearer <token>`;
 * - OAuth: `/oauth/:provider` routes are reserved for GitHub / Google sign-in (not implemented yet;
 *   `users.password_hash` is nullable and `oauth_accounts` exists for that).
 */
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { compact } from "../src/db/domain";
import type { AuthConfigResponse, AuthResponse, MeResponse, OAuthProvider, UserProfile } from "../src/db/schema";
import { readJsonObject } from "./http";
import type { AppEnv, AuthUser, Bindings } from "./types";

export const OAUTH_PROVIDERS: OAuthProvider[] = ["github", "google"];

const PASSWORD_SCHEME = "pbkdf2_sha256";
/** The Workers runtime rejects PBKDF2 iteration counts above 100 000. */
const MAX_PBKDF2_ITERATIONS = 100_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const DEFAULT_TOKEN_TTL_DAYS = 30;

const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{2,32}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

// ---------------------------------------------------------------------------
// Passwords (PBKDF2-SHA256)
// ---------------------------------------------------------------------------

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = MAX_PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, iterations);
  return `${PASSWORD_SCHEME}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  if (scheme !== PASSWORD_SCHEME || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) {
    return false;
  }
  const actual = await pbkdf2(password, fromBase64Url(saltText), iterations);
  return constantTimeEqual(actual, fromBase64Url(hashText));
}

/** Iteration count recorded in a stored hash (0 when unreadable). */
function readHashIterations(stored: string) {
  const iterations = Number(stored.split("$")[1]);
  return Number.isInteger(iterations) ? iterations : 0;
}

/**
 * Iterations for new hashes. `wrangler.toml` sets 10 000 because 100 000 (the runtime maximum,
 * used when the variable is missing) costs ~60 ms of CPU and exceeds the Workers Free plan limit.
 */
function passwordIterations(env: Bindings) {
  const configured = Number(env.PBKDF2_ITERATIONS);
  if (!Number.isInteger(configured)) return MAX_PBKDF2_ITERATIONS;
  return Math.min(MAX_PBKDF2_ITERATIONS, Math.max(MIN_PBKDF2_ITERATIONS, configured));
}

// ---------------------------------------------------------------------------
// Tokens (HS256 JWT)
// ---------------------------------------------------------------------------

type TokenClaims = { sub: string; username: string; iat: number; exp: number };

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function getHmacKey(secret: string) {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    key.catch(() => hmacKeys.delete(secret));
    hmacKeys.set(secret, key);
  }
  return key;
}

function getJwtSecret(env: Bindings) {
  const secret = env.JWT_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new HTTPException(500, { message: "服务器未配置 JWT_SECRET（至少 16 个字符），请联系管理员" });
  }
  return secret;
}

function tokenTtlSeconds(env: Bindings) {
  const days = Number(env.TOKEN_TTL_DAYS);
  const ttlDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : DEFAULT_TOKEN_TTL_DAYS;
  return Math.round(ttlDays * 24 * 60 * 60);
}

const encodeSegment = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));
const decodeSegment = (segment: string): unknown => JSON.parse(decoder.decode(fromBase64Url(segment)));

export async function signToken(user: AuthUser, secret: string, ttlSeconds: number) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = { sub: user.id, username: user.username, iat: issuedAt, exp: issuedAt + ttlSeconds };
  const unsigned = `${encodeSegment({ alg: "HS256", typ: "JWT" })}.${encodeSegment(claims)}`;
  const signature = await crypto.subtle.sign("HMAC", await getHmacKey(secret), encoder.encode(unsigned));
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenClaims | null> {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const [header, payload, signature] = segments;
  try {
    if ((decodeSegment(header) as { alg?: unknown })?.alg !== "HS256") return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(`${header}.${payload}`),
    );
    if (!valid) return null;
    const claims = decodeSegment(payload) as Partial<TokenClaims> | null;
    if (typeof claims?.sub !== "string" || typeof claims.username !== "string" || typeof claims.exp !== "number") {
      return null;
    }
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims as TokenClaims;
  } catch {
    return null;
  }
}

async function issueToken(env: Bindings, user: UserProfile) {
  return signToken({ id: user.id, username: user.username }, getJwtSecret(env), tokenTtlSeconds(env));
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth/config", "/api/auth/register", "/api/auth/login"]);

/**
 * Secure by default: every `/api/*` route requires a valid Bearer token except the public auth
 * endpoints above and the reserved OAuth routes. Sets `c.get("user")`.
 */
export const authGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  if (c.req.method === "OPTIONS" || PUBLIC_API_PATHS.has(path) || path.startsWith("/api/auth/oauth/")) {
    return next();
  }

  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header("Authorization") ?? "");
  if (!match) return c.json({ error: "请先登录" }, 401);

  const claims = await verifyToken(match[1], getJwtSecret(c.env));
  if (!claims) return c.json({ error: "登录已过期，请重新登录" }, 401);

  c.set("user", { id: claims.sub, username: claims.username });
  return next();
};

// ---------------------------------------------------------------------------
// Routes (mounted at /api/auth)
// ---------------------------------------------------------------------------

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  created_at: string;
};

function toUserProfile(row: UserRow): UserProfile {
  return compact({ id: row.id, username: row.username, email: row.email, createdAt: row.created_at });
}

function parseUsername(value: unknown) {
  const username = typeof value === "string" ? value.trim() : "";
  if (!USERNAME_PATTERN.test(username)) {
    throw new HTTPException(400, { message: "用户名需为 2-32 位字母、数字、中文或 _ . -" });
  }
  return username;
}

function parseEmail(value: unknown) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new HTTPException(400, { message: "邮箱格式不正确" });
  return email;
}

function parsePassword(value: unknown) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw new HTTPException(400, { message: `密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位` });
  }
  return value;
}

const registrationEnabled = (env: Bindings) => env.ALLOW_REGISTRATION?.trim().toLowerCase() !== "false";

async function hasAnyUser(db: D1Database) {
  return Boolean(await db.prepare("SELECT 1 AS found FROM users LIMIT 1").first());
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/config", async (c) => {
  const body: AuthConfigResponse = {
    registrationOpen: registrationEnabled(c.env) || !(await hasAnyUser(c.env.DB)),
    oauthProviders: OAUTH_PROVIDERS,
  };
  return c.json(body);
});

authRoutes.post("/register", async (c) => {
  const body = await readJsonObject(c);
  const username = parseUsername(body.username);
  const email = parseEmail(body.email);
  const password = parsePassword(body.password);

  const open = registrationEnabled(c.env);
  if (!open && (await hasAnyUser(c.env.DB))) return c.json({ error: "当前未开放注册" }, 403);

  const taken = await c.env.DB.prepare(
    "SELECT username FROM users WHERE username = ?1 OR (?2 IS NOT NULL AND email = ?2) LIMIT 1",
  )
    .bind(username, email ?? null)
    .first<Pick<UserRow, "username">>();
  if (taken) {
    const sameName = taken.username.toLowerCase() === username.toLowerCase();
    return c.json({ error: sameName ? "用户名已被占用" : "邮箱已被注册" }, 409);
  }

  const user: UserProfile = compact({
    id: `user-${crypto.randomUUID()}`,
    username,
    email,
    createdAt: new Date().toISOString(),
  });
  const passwordHash = await hashPassword(password, passwordIterations(c.env));

  // With sign-ups closed only the very first account may be created. The guard lives inside the
  // INSERT so two concurrent "first" registrations cannot both succeed.
  const insert = open
    ? "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    : "INSERT INTO users (id, username, email, password_hash, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (SELECT 1 FROM users)";
  let inserted = 0;
  try {
    const result = await c.env.DB.prepare(insert).bind(user.id, username, email ?? null, passwordHash, user.createdAt).run();
    inserted = result.meta.changes;
  } catch (error) {
    if (String(error).includes("UNIQUE")) return c.json({ error: "用户名或邮箱已被占用" }, 409);
    throw error;
  }
  if (inserted !== 1) return c.json({ error: "当前未开放注册" }, 403);

  const response: AuthResponse = { token: await issueToken(c.env, user), user };
  return c.json(response, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await readJsonObject(c);
  const rawIdentifier = body.identifier ?? body.username ?? body.email;
  const identifier = typeof rawIdentifier === "string" ? rawIdentifier.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password) return c.json({ error: "请输入账号和密码" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT id, username, email, password_hash, created_at FROM users WHERE username = ?1 OR email = ?1 LIMIT 1",
  )
    .bind(identifier)
    .first<UserRow>();
  const valid =
    row?.password_hash && password.length <= MAX_PASSWORD_LENGTH ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !valid) return c.json({ error: "账号或密码错误" }, 401);

  // Upgrade hashes created with fewer iterations (e.g. after raising PBKDF2_ITERATIONS).
  const iterations = passwordIterations(c.env);
  if (row.password_hash && readHashIterations(row.password_hash) < iterations) {
    const upgraded = await hashPassword(password, iterations);
    await c.env.DB.prepare("UPDATE users SET password_hash = ?1 WHERE id = ?2").bind(upgraded, row.id).run();
  }

  const user = toUserProfile(row);
  const response: AuthResponse = { token: await issueToken(c.env, user), user };
  return c.json(response);
});

/** Protected by {@link authGuard} (not in the public allow-list). */
authRoutes.get("/me", async (c) => {
  const row = await c.env.DB.prepare("SELECT id, username, email, password_hash, created_at FROM users WHERE id = ?1")
    .bind(c.get("user").id)
    .first<UserRow>();
  if (!row) return c.json({ error: "账号不存在或已被删除" }, 401);
  const response: MeResponse = { user: toUserProfile(row), oauthProviders: OAUTH_PROVIDERS };
  return c.json(response);
});

/** Reserved for GitHub / Google sign-in: will redirect to the provider and handle its callback. */
function oauthNotImplemented(c: Parameters<MiddlewareHandler<AppEnv>>[0], provider: string) {
  if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) return c.json({ error: "不支持的登录方式" }, 404);
  return c.json({ error: `${provider} 登录即将开放，目前请使用账号密码登录`, provider, implemented: false }, 501);
}

authRoutes.get("/oauth/:provider", (c) => oauthNotImplemented(c, c.req.param("provider")));
authRoutes.get("/oauth/:provider/callback", (c) => oauthNotImplemented(c, c.req.param("provider")));
