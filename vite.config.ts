import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: Record<string, string | undefined>;
};

const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
// `pnpm run dev:worker` (wrangler dev) listens here; the dev server proxies `/api` to it so the
// frontend can use same-origin requests without CORS during development.
const workerDevUrl = process.env.WORKER_DEV_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  base: isGitHubActions ? "/spinventory/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The equipment catalog data (hundreds of products) changes on its own schedule: a separate
        // chunk stays cached across app updates and vice versa.
        manualChunks: (id) => (/[\\/]src[\\/]data[\\/]catalog[\\/]/.test(id) ? "catalog" : undefined),
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: workerDevUrl, changeOrigin: true },
    },
  },
});
