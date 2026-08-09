// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv, type Plugin } from "vite";

// Vite exposes only VITE_* values to application modules. That is correct for
// the browser, but local TanStack server functions also need the same backend
// secrets that Lovable injects at runtime in deployed environments. Load an
// explicit server-only allowlist into process.env during local dev/build; none
// of these values are added to Vite's client-side `define` map.
const SERVER_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "POSTFLOW_APP_URL",
  "POSTFLOW_TOKEN_ENCRYPTION_KEY",
  "SOCIAL_TOKEN_ENC_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "LOVABLE_API_KEY",
  "YOUTUBE_OAUTH_CLIENT_ID",
  "YOUTUBE_OAUTH_CLIENT_SECRET",
  "YOUTUBE_REDIRECT_URI",
  "META_OAUTH_CLIENT_ID",
  "META_OAUTH_CLIENT_SECRET",
  "META_PAGES_MANAGE_POSTS_AVAILABLE",
  "INSTAGRAM_OAUTH_CLIENT_ID",
  "INSTAGRAM_OAUTH_CLIENT_SECRET",
  "INSTAGRAM_REDIRECT_URI",
  "PINTEREST_OAUTH_CLIENT_ID",
  "PINTEREST_OAUTH_CLIENT_SECRET",
  "SNAPCHAT_OAUTH_CLIENT_ID",
  "SNAPCHAT_OAUTH_CLIENT_SECRET",
  "SNAPCHAT_OAUTH_PUBLIC_CLIENT_ID",
  "SNAPCHAT_REDIRECT_URI",
  "SNAPCHAT_PUBLIC_PROFILE_CLIENT_ID",
  "SNAPCHAT_PUBLIC_PROFILE_CLIENT_SECRET",
  "SNAPCHAT_PUBLIC_PROFILE_REDIRECT_URI",
  "SNAPCHAT_PP_API_BASE",
  "MEDIA_PROCESSOR_URL",
  "MEDIA_PROCESSOR_TOKEN",
] as const;

function localServerEnv(): Plugin {
  return {
    name: "postflow-local-server-env",
    enforce: "pre",
    config(_config, env) {
      const loaded = loadEnv(env.mode, process.cwd(), "");
      for (const key of SERVER_ENV_KEYS) {
        if (!process.env[key] && loaded[key]) process.env[key] = loaded[key];
      }
    },
  };
}

export default defineConfig({
  // Render runs this as a Node web service. Lovable's own build still forces
  // its Cloudflare target internally, so this preserves Lovable deployment
  // behavior while producing a runnable Node SSR entry for Render.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [localServerEnv(), mcpPlugin()],
  },
});
