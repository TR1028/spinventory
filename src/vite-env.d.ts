/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Cloudflare Worker API, e.g. `https://spinventory-api.<account>.workers.dev`.
   * Leave empty in development to call `/api` on the Vite dev server (proxied to `wrangler dev`).
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
