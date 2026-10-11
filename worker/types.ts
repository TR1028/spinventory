import type { Context } from "hono";

export type Bindings = {
  DB: D1Database;
  /** HMAC key for login tokens. Secret (`wrangler secret put JWT_SECRET` / `.dev.vars`), >= 16 chars. */
  JWT_SECRET?: string;
  /** `"false"` closes sign-ups; the very first account can always register. */
  ALLOW_REGISTRATION?: string;
  /** Comma-separated browser origins allowed by CORS, or `"*"` (default). */
  CORS_ORIGINS?: string;
  /** PBKDF2 iterations for new password hashes (10 000 - 100 000; 100 000 when unset, `wrangler.toml` sets 10 000). */
  PBKDF2_ITERATIONS?: string;
  /** Optional login token lifetime in days (default 30). */
  TOKEN_TTL_DAYS?: string;
};

export type AuthUser = { id: string; username: string };

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: AuthUser };
};

export type AppContext = Context<AppEnv>;
